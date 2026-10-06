import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase/config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = s => document.querySelector(s);

const IMAGE_BUCKET = "story-images";
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_IMAGES = 10;

function esc(v="") {
  return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

let currentUser = null;
let currentCoupleId = null;

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

    if (error) {
      console.error(error);
    } else {
      currentCoupleId = membership?.couple_id || null;
    }
  }

  updateAuthUI();
  await loadStories();
}

function updateAuthUI() {
  $("#authBtn").textContent = currentUser ? "Đăng xuất" : "Đăng nhập";
  $("#addStoryBtn").disabled = !currentUser;
  $("#modeText").textContent = currentUser ? "Đã đăng nhập: " + (currentUser.email || "") : "Chế độ xem — cần đăng nhập để thêm";
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
    .select("id, story_date, title, content, created_at, author_id")
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
  const imageRows = stories.length ? ((await supabase.from("story_images").select("story_id, storage_path, sort_order").in("story_id", stories.map(s => s.id)).order("sort_order")).data || []) : [];
  const imagesByStory = new Map();
  for (const row of imageRows) {
    const signed = await supabase.storage.from(IMAGE_BUCKET).createSignedUrl(row.storage_path, 3600);
    if (signed.error) continue;
    row.url = signed.data.signedUrl;
    if (!imagesByStory.has(row.story_id)) imagesByStory.set(row.story_id, []);
    imagesByStory.get(row.story_id).push(row);
  }
  $("#storyCount").textContent = stories.length;
  $("#emptyState").hidden = stories.length > 0;

  $("#timeline").innerHTML = stories.map(s => {
    const d = new Date(s.story_date + "T00:00:00").toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });
    return `<article class="story">
      <div class="story-date">${d}</div>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.content).replace(/\n/g, "<br>")}</p>
      ${imagesByStory.has(s.id) ? `<div class="story-images">${imagesByStory.get(s.id).map(img => `<img src="${img.url}" alt="Ảnh kỷ niệm" loading="lazy">`).join("")}</div>` : ""}
      <div class="story-author">❤️ ${s.author_id === currentUser?.id ? "Bạn" : "Người ấy"}</div>
    </article>`;
  }).join("");
}

$("#addStoryBtn").onclick = () => {
  if (!currentUser) return $("#authDialog").showModal();
  $("#storyDate").value = new Date().toISOString().slice(0, 10);
  $("#storyDialog").showModal();
};

$("#storyImages").addEventListener("change", () => {
  const files = [...$("#storyImages").files].slice(0, MAX_IMAGES);
  $("#imagePreview").innerHTML = files.map(f => `<div class="image-preview-item"><img src="${URL.createObjectURL(f)}" alt="${esc(f.name)}"><span>${esc(f.name)}</span></div>`).join("");
});

$("#closeDialog").onclick = () => {
  $("#storyDialog").close();
  $("#storyImages").value = "";
  $("#imagePreview").innerHTML = "";
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
  if (!currentUser) return;

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

  submit.disabled = true;
  submit.textContent = "Đang lưu…";

  if (!currentCoupleId) {
    $("#storyFormError").textContent = "Không tìm thấy kết nối của hai tài khoản. Hãy kiểm tra couple_members trong Supabase.";
    submit.disabled = false;
    submit.textContent = "Lưu kỷ niệm ❤️";
    return;
  }

  const { data, error } = await supabase.from("stories").insert({
    couple_id: currentCoupleId,
    author_id: currentUser.id,
    story_date: storyDate,
    title,
    content
  });

  submit.disabled = false;
  submit.textContent = "Lưu kỷ niệm ❤️";

  if (error) {
    $("#storyFormError").textContent = error.message;
    return;
  }

  if (files.length && data?.[0]?.id) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${currentCoupleId}/${data[0].id}/${crypto.randomUUID()}.${ext}`;
      const upload = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
      if (upload.error) { console.error(upload.error); continue; }
      const imageInsert = await supabase.from("story_images").insert({ story_id: data[0].id, couple_id: currentCoupleId, storage_path: path, sort_order: i });
      if (imageInsert.error) { console.error(imageInsert.error); await supabase.storage.from(IMAGE_BUCKET).remove([path]); }
    }
  }

  $("#storyFormError").textContent = "";
  e.target.reset();
  $("#storyImages").value = "";
  $("#imagePreview").innerHTML = "";
  $("#storyDialog").close();
  await loadStories();
});

supabase.auth.onAuthStateChange(async (_event, session) => {
  currentUser = session?.user || null;
  updateAuthUI();
  await loadStories();
});

loadUser();
