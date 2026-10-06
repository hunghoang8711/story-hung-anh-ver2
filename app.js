import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase/config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = s => document.querySelector(s);

const IMAGE_BUCKET = "story-images";
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_IMAGES = 10;

function esc(v = "") {
  return String(v).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

let currentUser = null;
let currentCoupleId = null;
let realtimeChannel = null;
let editingStory = null;

async function setupRealtime() {
  if (realtimeChannel) {
    await supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
  if (!currentCoupleId) return;

  realtimeChannel = supabase
    .channel("stories-realtime-" + currentCoupleId)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "stories",
      filter: "couple_id=eq." + currentCoupleId
    }, async () => {
      await loadStories();
    })
    .subscribe();
}

async function loadUser() {
  const { data } = await supabase.auth.getUser();
  currentUser = data.user || null;
  currentCoupleId = null;

  if (currentUser) {
    const { data: membership, error } = await supabase
      .from("couple_members")
      .select("couple_id")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) console.error(error);
    else currentCoupleId = membership?.couple_id || null;
  }

  updateAuthUI();
  await setupRealtime();
  await loadStories();
}

function updateAuthUI() {
  $("#authBtn").textContent = currentUser ? "Đăng xuất" : "Đăng nhập";
  $("#addStoryBtn").disabled = !currentUser;
  $("#modeText").textContent = currentUser
    ? "Đã đăng nhập: " + (currentUser.email || "")
    : "Chế độ xem — cần đăng nhập để thêm";
}

async function getStoryImages(storyIds) {
  if (!storyIds.length) return new Map();

  const { data, error } = await supabase
    .from("story_images")
    .select("id, story_id, storage_path, sort_order")
    .in("story_id", storyIds)
    .order("sort_order");

  if (error) {
    console.error(error);
    return new Map();
  }

  const imagesByStory = new Map();

  for (const row of data || []) {
    const signed = await supabase.storage
      .from(IMAGE_BUCKET)
      .createSignedUrl(row.storage_path, 3600);

    if (signed.error) continue;

    row.url = signed.data.signedUrl;
    if (!imagesByStory.has(row.story_id)) imagesByStory.set(row.story_id, []);
    imagesByStory.get(row.story_id).push(row);
  }

  return imagesByStory;
}

async function loadStories() {
  if (!currentUser || !currentCoupleId) {
    $("#timeline").innerHTML = "";
    $("#storyCount").textContent = "0";
    $("#emptyState").hidden = false;
    return;
  }

  const { data, error } = await supabase
    .from("stories")
    .select("id, story_date, title, content, created_at, updated_at, author_id")
    .eq("couple_id", currentCoupleId)
    .order("story_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    $("#timeline").innerHTML = "<p class='muted'>Không tải được dữ liệu. Hãy kiểm tra schema/RLS trong Supabase.</p>";
    $("#storyCount").textContent = "0";
    $("#emptyState").hidden = true;
    return;
  }

  const stories = data || [];
  const imagesByStory = await getStoryImages(stories.map(s => s.id));

  $("#storyCount").textContent = stories.length;
  $("#emptyState").hidden = stories.length > 0;

  $("#timeline").innerHTML = stories.map(s => {
    const d = new Date(s.story_date + "T00:00:00").toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });
    const images = imagesByStory.get(s.id) || [];

    return `<article class="story">
      <div class="story-date">${d}</div>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.content).replace(/\n/g, "<br>")}</p>
      ${images.length ? `<div class="story-images">${images.map(img =>
        `<img src="${img.url}" alt="Ảnh kỷ niệm" loading="lazy">`
      ).join("")}</div>` : ""}
      <div class="story-author">❤️ ${s.author_id === currentUser?.id ? "Bạn" : "Người ấy"}${s.updated_at !== s.created_at ? " · Đã chỉnh sửa" : ""}</div>
      ${s.author_id === currentUser?.id ? `<div class="story-actions">
        <button class="btn btn-ghost btn-small edit-story-btn" data-id="${s.id}">✏️ Sửa kỷ niệm</button>
      </div>` : ""}
    </article>`;
  }).join("");

  document.querySelectorAll(".edit-story-btn").forEach(btn => {
    btn.onclick = () => openEditStory(btn.dataset.id, stories);
  });
}

function resetStoryDialog() {
  editingStory = null;
  $("#storyDialogEyebrow").textContent = "NEW MEMORY";
  $("#storyDialogTitle").textContent = "Thêm kỷ niệm";
  $("#storySubmitBtn").textContent = "Lưu kỷ niệm ❤️";
  $("#existingImages").innerHTML = "";
  $("#imagePreview").innerHTML = "";
  $("#storyImages").value = "";
  $("#storyFormError").textContent = "";
}

async function openEditStory(storyId, stories) {
  const story = stories.find(s => s.id === storyId);
  if (!story || story.author_id !== currentUser?.id) return;

  editingStory = story;
  $("#storyDialogEyebrow").textContent = "EDIT MEMORY";
  $("#storyDialogTitle").textContent = "Sửa kỷ niệm";
  $("#storySubmitBtn").textContent = "Lưu thay đổi ❤️";
  $("#storyDate").value = story.story_date;
  $("#storyTitle").value = story.title;
  $("#storyContent").value = story.content;
  $("#storyImages").value = "";
  $("#imagePreview").innerHTML = "";
  $("#storyFormError").textContent = "";

  const { data: images, error } = await supabase
    .from("story_images")
    .select("id, storage_path, sort_order")
    .eq("story_id", story.id)
    .order("sort_order");

  if (error) {
    console.error(error);
    $("#existingImages").innerHTML = "";
  } else {
    const signedImages = [];
    for (const image of images || []) {
      const signed = await supabase.storage.from(IMAGE_BUCKET)
        .createSignedUrl(image.storage_path, 3600);
      if (!signed.error) signedImages.push({...image, url: signed.data.signedUrl});
    }

    $("#existingImages").innerHTML = signedImages.length
      ? signedImages.map(img => `<div class="existing-image-item">
          <img src="${img.url}" alt="Ảnh hiện tại">
          <label class="image-remove">
            <input type="checkbox" data-remove-image-id="${img.id}" data-remove-image-path="${esc(img.storage_path)}">
            Xóa ảnh
          </label>
        </div>`).join("")
      : "<span class='muted'>Kỷ niệm này chưa có ảnh.</span>";
  }

  $("#storyDialog").showModal();
}

$("#addStoryBtn").onclick = () => {
  if (!currentUser) return $("#authDialog").showModal();
  resetStoryDialog();
  $("#storyDate").value = new Date().toISOString().slice(0, 10);
  $("#storyDialog").showModal();
};

$("#storyImages").addEventListener("change", () => {
  const files = [...$("#storyImages").files].slice(0, MAX_IMAGES);
  $("#imagePreview").innerHTML = files.map(f => `<div class="image-preview-item">
    <img src="${URL.createObjectURL(f)}" alt="${esc(f.name)}">
    <span>${esc(f.name)}</span>
  </div>`).join("");
});

$("#closeDialog").onclick = () => {
  $("#storyDialog").close();
  resetStoryDialog();
};

$("#closeAuth").onclick = () => $("#authDialog").close();

$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  if (!email || !password) return;

  const button = e.submitter;
  button.disabled = true;
  button.textContent = "Đang xử lý…";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  button.disabled = false;
  button.textContent = "Đăng nhập";

  if (error) {
    $("#authError").textContent = error.message;
    return;
  }

  $("#authError").textContent = "";
  $("#authDialog").close();
  await loadUser();
});

$("#signupBtn").onclick = async () => {
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;

  if (!email || password.length < 6) {
    $("#authError").textContent = "Nhập email và mật khẩu tối thiểu 6 ký tự.";
    return;
  }

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    $("#authError").textContent = error.message;
    return;
  }

  $("#authError").textContent = "Đã tạo tài khoản. Nếu Supabase yêu cầu xác minh email, hãy mở email để xác minh.";
};

$("#authBtn").onclick = async () => {
  if (!currentUser) {
    $("#authDialog").showModal();
    return;
  }

  await supabase.auth.signOut();
  await loadUser();
};

$("#storyForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!currentUser || !currentCoupleId) return;

  const title = $("#storyTitle").value.trim();
  const content = $("#storyContent").value.trim();
  const storyDate = $("#storyDate").value;
  const files = [...$("#storyImages").files].slice(0, MAX_IMAGES);
  const submit = e.submitter;

  const invalid = files.find(f => !f.type.startsWith("image/") || f.size > MAX_IMAGE_SIZE);
  if (invalid) {
    $("#storyFormError").textContent = "Mỗi ảnh phải là file hình ảnh và không vượt quá 8 MB.";
    return;
  }

  if (!title || !content || !storyDate) {
    $("#storyFormError").textContent = "Vui lòng nhập đầy đủ ngày, tiêu đề và nội dung.";
    return;
  }

  submit.disabled = true;
  submit.textContent = editingStory ? "Đang cập nhật…" : "Đang lưu…";

  if (!editingStory) {
    const { data, error } = await supabase.from("stories").insert({
      couple_id: currentCoupleId,
      author_id: currentUser.id,
      story_date: storyDate,
      title,
      content
    }).select("id").single();

    if (error) {
      $("#storyFormError").textContent = error.message;
      submit.disabled = false;
      submit.textContent = "Lưu kỷ niệm ❤️";
      return;
    }

    await uploadNewImages(data.id, files);
  } else {
    const storyId = editingStory.id;

    const { error } = await supabase
      .from("stories")
      .update({ story_date: storyDate, title, content, updated_at: new Date().toISOString() })
      .eq("id", storyId)
      .eq("author_id", currentUser.id);

    if (error) {
      $("#storyFormError").textContent = error.message;
      submit.disabled = false;
      submit.textContent = "Lưu thay đổi ❤️";
      return;
    }

    const removeChecks = [...document.querySelectorAll("[data-remove-image-id]:checked")];
    for (const checkbox of removeChecks) {
      const imageId = checkbox.dataset.removeImageId;
      const path = checkbox.dataset.removeImagePath;

      const storageResult = await supabase.storage.from(IMAGE_BUCKET).remove([path]);
      if (storageResult.error) console.error(storageResult.error);

      const rowResult = await supabase.from("story_images").delete().eq("id", imageId);
      if (rowResult.error) console.error(rowResult.error);
    }

    await uploadNewImages(storyId, files);
  }

  submit.disabled = false;
  resetStoryDialog();
  $("#storyForm").reset();
  $("#storyDialog").close();
  await loadStories();
});

async function uploadNewImages(storyId, files) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = (file.name.split(".").pop() || "jpg")
      .toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${currentCoupleId}/${storyId}/${crypto.randomUUID()}.${ext}`;

    const upload = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
      cacheControl: "31536000", upsert: false, contentType: file.type
    });

    if (upload.error) {
      console.error(upload.error);
      continue;
    }

    const imageInsert = await supabase.from("story_images").insert({
      story_id: storyId,
      couple_id: currentCoupleId,
      storage_path: path,
      sort_order: Date.now() + i
    });

    if (imageInsert.error) {
      console.error(imageInsert.error);
      await supabase.storage.from(IMAGE_BUCKET).remove([path]);
    }
  }
}

supabase.auth.onAuthStateChange(async (_event, session) => {
  currentUser = session?.user || null;

  if (!currentUser) {
    currentCoupleId = null;
    await setupRealtime();
  }

  updateAuthUI();
  await loadStories();
});

loadUser();
