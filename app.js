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
let timelineStories = [];
let timelineImages = new Map();

const LEGACY_MEMORIES = [
["2022-07-07","Ngày khởi đầu","Ngày bắt đầu làm quen với Ánh"],
["2022-08-10","Lần đầu gặp Ánh - Buổi xem phim bão tố :))","Ánh đi học với làm cả ngày nên tối mệt, phim thì khó hiểu nên Ánh ngủ mất, vẫn xinh và đáng yêu.\nKhi về trời mưa nhưng vẫn kéo nhau lên tận Hà Đông ăn trứng vịt lộn."],
["2022-08-27","Bắt đầu tìm hiểu lại sau 1 số biến cố","Hmm, chỉ là bắt đầu lại thôi, tình yêu nào mà chẳng phải có chút sóng gió thì mới bền chặt được hơn đúng không?"],
["2022-08-28","Lần đầu đi ăn cùng Ánh","Nhai lâu quá làm Ánh phải chờ :))"],
["2022-09-09","Sinh nhật Ánh","Buổi chiều có đi hiến máu cùng Ánh, tối tổ chức sinh nhật sớm cho Ánh"],
["2022-09-16","Hình như đang ở giai đoạn chán dần, có vẻ Ánh đã chán","Qua cảm nhận thấy Ánh đang chán mình dần, không còn nói chuyện nhiều, dần lạnh nhạt và có vẻ như mình đang làm phiền Ánh\nLiệu đây có phải kết thúc ..."],
["2022-09-17","Ánh đang chịu nhiều áp lực","Ánh đang bị nhiều áp lực nhưng Ánh không muốn kể, Ánh chán Hà Nội"],
["2022-09-22","Tỏ tình Ánh nhưng tạch","..."],
["2022-09-25","Xem phim lần 2 với Ánh","Ánh cười nhiều lắm, muốn nắm tay Ánh bước đi nhưng mà ngại, đã là gì của Ánh đâu"],
["2022-09-27","Dạo này Ánh chịu nhiều áp lực","Ánh phải tìm trọ, áp lực tiền bạc lẫn học hành, Ánh đang mệt"],
["2022-09-28","Ánh muốn dừng lại","Đã làm Ánh buồn nhiều, nhưng không, mình không muốn buông, có lỗi thì phải sửa, cái gì hỏng thì sửa, chứ đừng vứt đi."],
["2022-10-01","Hành trình tìm trọ cho Ánh","Lượn khắp mọi ngõ ngách cũng không tìm được, tưởng như tuyệt vọng thì lại may mắn gặp được ông chú vi diệu, quý nhân chỉ đường"],
["2022-10-03","Chuyển đồ giúp Ánh","Ê hê nay lại được nắm tay Ánh nè =))\nThích cực, muốn nắm mãi cơ :>>"],
["2022-10-06","Chính thức yêu nhau","Yeee tỏ tình thành công rồi\nVới tôn chỉ không để ai biết trước mình sẽ làm gì =))\nYêu Ánh nhiều lắm"],
["2022-10-15","Kỷ niệm 15/10/2022","..."],
["2022-10-19","Dẫn em yêu đi ngắm chùa Thầy","Chùa Thầy đẹp tuyệt vời và Ánh cũng thế\nBị lừa cú hơi đau nhưng mà nói chung mọi thứ đều tuyệt vời"],
["2022-10-20","20/10 cùng Ánh","Vuiii"],
["2022-10-27","Đưa em yêu đi hết con đường tình yêu Sư phạm","Đến giờ muộn nên nhanh đến giờ về quá\nLần sau dẫn Ánh đi tiếp :))."]
];

async function migrateLegacyMemories() {
  if (!currentUser || !currentCoupleId) return;
  const { data: existing, error } = await supabase.from("stories").select("story_date,title").eq("couple_id", currentCoupleId);
  if (error) return console.error("Legacy migration read:", error);
  const keys = new Set((existing || []).map(s => s.story_date + "||" + s.title));
  const missing = LEGACY_MEMORIES.filter(([d,t]) => !keys.has(d + "||" + t)).map(([story_date,title,content]) => ({couple_id:currentCoupleId,author_id:currentUser.id,story_date,title,content}));
  if (!missing.length) return;
  for (const story of missing) {
    const result = await supabase.from("stories").insert(story);
    if (result.error) {
      console.error("Legacy migration insert failed:", story.title, result.error);
    }
  }
}


const LEGACY_IMAGES = [
  ["images/330191.jpg","330191.jpg"],
  ["images/330289.jpg","330289.jpg"],
  ["images/330289.png","330289.png"],
  ["images/330300.jpg","330300.jpg"],
  ["images/418564.jpg","418564.jpg"],
  ["images/938d09d85f343932c54119bce8e0913d.jpg","938d09d85f343932c54119bce8e0913d.jpg"],
  ["images/about.jpg","about.jpg"],
  ["images/anh-01.jpg","anh-01.jpg"],
  ["images/banner.jpg","banner.jpg"],
  ["images/blog01.jpg","blog01.jpg"],
  ["images/logoUet.jpg","logoUet.jpg"],
  ["images/logouet.png","logouet.png"],
  ["images/london.png","london.png"],
  ["images/nature01.jpg","nature01.jpg"],
  ["images/picture-sky.jpg","picture-sky.jpg"],
  ["images/picture-sky.png","picture-sky.png"],
  ["images/picture-sky1.png","picture-sky1.png"],
  ["images/picture02.jpg","picture02.jpg"],
  ["images/picture02.png","picture02.png"],
  ["images/picture03.jpg","picture03.jpg"],
  ["images/picture03.png","picture03.png"],
  ["images/user01.jpg","user01.jpg"],
  ["images/user02.jpg","user02.jpg"]
];

async function findOrCreateLegacyStory() {
  const title = "Ảnh lưu trữ từ website cũ";
  const { data: found, error } = await supabase.from("stories")
    .select("id").eq("couple_id", currentCoupleId).eq("title", title).limit(1).maybeSingle();
  if (error) throw error;
  if (found) return found.id;

  const { data, error: createError } = await supabase.from("stories").insert({
    couple_id: currentCoupleId,
    author_id: currentUser.id,
    story_date: "2022-07-07",
    title,
    content: "Các hình ảnh được lưu từ website Love Story cũ. Những ảnh có mốc xác định sẽ được ghép vào đúng kỷ niệm; các ảnh không có thông tin ngày tháng được giữ trong mốc lưu trữ này."
  }).select("id").single();
  if (createError) throw createError;
  return data.id;
}

async function migrateLegacyImages() {
  if (!currentUser || !currentCoupleId) return;

  const doneKey = "legacy-images-migrated-" + currentCoupleId;
  if (localStorage.getItem(doneKey) === "1") return;

  const archiveStoryId = await findOrCreateLegacyStory();

  const { data: existingRows, error: existingError } = await supabase
    .from("story_images")
    .select("storage_path, story_id")
    .eq("couple_id", currentCoupleId);
  if (existingError) throw existingError;

  const existingNames = new Set((existingRows || []).map(r => r.storage_path.split("/").pop()));

  // This is the only image explicitly associated with a dated milestone in love_story.html.
  const datedImageStory = new Map([
    ["anh-01.jpg", await getStoryIdByDateAndTitle("2022-10-06", "Chính thức yêu nhau")]
  ]);

  for (const [sourcePath, fileName] of LEGACY_IMAGES) {
    if (existingNames.has(fileName)) continue;

    const response = await fetch("https://raw.githubusercontent.com/hunghoang8711/story.hung.anh/main/" + sourcePath);
    if (!response.ok) {
      console.warn("Cannot download legacy image:", sourcePath, response.status);
      continue;
    }

    const blob = await response.blob();
    const ext = (fileName.split(".").pop() || "jpg").toLowerCase();
    const targetStoryId = datedImageStory.get(fileName) || archiveStoryId;
    const storagePath = currentCoupleId + "/" + targetStoryId + "/legacy-" + fileName;

    const upload = await supabase.storage.from(IMAGE_BUCKET).upload(storagePath, blob, {
      cacheControl: "31536000",
      upsert: false,
      contentType: blob.type || ("image/" + ext)
    });

    if (upload.error) {
      console.warn("Cannot upload legacy image:", fileName, upload.error);
      continue;
    }

    const row = await supabase.from("story_images").insert({
      story_id: targetStoryId,
      couple_id: currentCoupleId,
      storage_path: storagePath,
      sort_order: Date.now()
    });

    if (row.error) {
      console.warn("Cannot register legacy image:", fileName, row.error);
      await supabase.storage.from(IMAGE_BUCKET).remove([storagePath]);
    }
  }

  localStorage.setItem(doneKey, "1");
}

async function getStoryIdByDateAndTitle(date, title) {
  const { data, error } = await supabase.from("stories")
    .select("id").eq("couple_id", currentCoupleId)
    .eq("story_date", date).eq("title", title).limit(1).maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

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

async function loadMembership() {
  currentCoupleId = null;
  if (!currentUser) return;

  const { data: membership, error } = await supabase
    .from("couple_members")
    .select("couple_id")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Membership lookup failed:", error);
    return;
  }

  currentCoupleId = membership?.couple_id || null;
}

async function loadUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) console.error("Auth lookup failed:", error);

  currentUser = data.user || null;
  await loadMembership();

  updateAuthUI();
  await setupRealtime();

  if (currentUser && currentCoupleId) {
    await migrateLegacyMemories();
    try { await migrateLegacyImages(); } catch (error) { console.error("Legacy image migration:", error); }
  }

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

  timelineStories = stories;
  timelineImages = imagesByStory;
  renderTimelineNav(stories);

  $("#timeline").innerHTML = stories.map(s => {
    const d = new Date(s.story_date + "T00:00:00").toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });
    const images = imagesByStory.get(s.id) || [];

    const [storyYear, storyMonth] = s.story_date.split("-");
    return `<article class="story" data-year="${storyYear}" data-month="${storyYear}-${storyMonth}" id="story-${s.id}">
      <div class="story-date">${d}</div>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.content).replace(/\n/g, "<br>")}</p>
      ${images.length ? `<div class="story-images"><img src="${images[0].url}" alt="Ảnh kỷ niệm" loading="lazy">${images.length > 1 ? `<span class="image-more-badge" style="background-image:url(${images[1].url})"><span>+${images.length - 1}</span></span>` : ""}</div>` : ""}
      <div class="story-author">❤️ ${s.author_id === currentUser?.id ? "Bạn" : "Người ấy"}${s.updated_at !== s.created_at ? " · Đã chỉnh sửa" : ""}</div>
      <button type="button" class="story-expand ${images.length ? "has-images" : ""}" data-expand-story="${s.id}" aria-label="Mở ảnh kỷ niệm">${stories.indexOf(s) % 2 === 0 ? "<<<" : ">>>"}</button>
      ${s.author_id === currentUser?.id ? `<div class="story-actions">
        <button type="button" class="btn btn-ghost btn-small edit-story-btn" data-id="${s.id}">✏️ Sửa kỷ niệm</button>
      </div>` : ""}
    </article>`;
  }).join("");

  document.querySelectorAll(".story-expand").forEach(btn => {
    btn.onclick = () => openStoryDetail(btn.dataset.expandStory);
  });

  document.querySelectorAll(".edit-story-btn").forEach(btn => {
    btn.onclick = () => openEditStory(btn.dataset.id, stories);
  });
}

function renderTimelineNav(stories) {
  const nav = $("#timelineNav");
  if (!nav) return;
  const groups = new Map();
  for (const story of stories) {
    const [year, month] = story.story_date.split("-");
    if (!groups.has(year)) groups.set(year, new Set());
    groups.get(year).add(month);
  }
  nav.innerHTML = [...groups.entries()].map(([year, months]) => `
    <div class="nav-year">
      <button type="button" class="year-link" data-nav-year="${year}">${year}</button>
      <div class="month-list">
        ${[...months].sort().map(month => `<button type="button" class="month-link" data-nav-month="${year}-${month}">${["January","February","March","April","May","June","July","August","September","October","November","December"][Number(month)-1]} -T${Number(month)}</button>`).join("")}
      </div>
    </div>
  `).join("");
  nav.querySelectorAll("[data-nav-year]").forEach(btn => btn.onclick = () => {
    document.querySelector(`.story[data-year="${btn.dataset.navYear}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});
  });
  nav.querySelectorAll("[data-nav-month]").forEach(btn => btn.onclick = () => {
    document.querySelector(`.story[data-month="${btn.dataset.navMonth}"]`)?.scrollIntoView({behavior:"smooth",block:"center"});
  });
}

async function openStoryDetail(storyId) {
  const story = timelineStories.find(s => String(s.id) === String(storyId));
  if (!story) return;
  const images = timelineImages.get(story.id) || [];
  const d = new Date(story.story_date + "T00:00:00").toLocaleDateString("vi-VN", {day:"2-digit",month:"2-digit",year:"numeric"});
  $("#detailContent").innerHTML = `
    <p class="eyebrow">MEMORY</p>
    <div class="detail-date">${d}</div>
    <h2>${esc(story.title)}</h2>
    <p class="detail-text">${esc(story.content).replace(/\\n/g,"<br>")}</p>
    ${images.length ? `<div class="detail-gallery">${images.map((img,i) => `<figure><img src="${img.url}" alt="Ảnh kỷ niệm ${i+1}" loading="lazy"><figcaption>Ảnh ${i+1}</figcaption></figure>`).join("")}</div>` : "<p class='muted'>Kỷ niệm này chưa có ảnh.</p>"}
  `;
  $("#storyDetailDialog").showModal();
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
  const story = stories.find(s => String(s.id) === String(storyId));
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
  $("#storyForm").reset();
  resetStoryDialog();
};

$("#closeAuth").onclick = () => $("#authDialog").close();
$("#closeStoryDetail").onclick = () => $("#storyDetailDialog").close();

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

    const imageErrors = await uploadNewImages(data.id, files);
    if (imageErrors.length) {
      $("#storyFormError").textContent = "Kỷ niệm đã lưu nhưng ảnh chưa lưu được: " + imageErrors.join(" | ");
      submit.disabled = false;
      submit.textContent = "Lưu kỷ niệm ❤️";
      await loadStories();
      return;
    }
  } else {
    const storyId = editingStory.id;

    const { data: updated, error } = await supabase
      .from("stories")
      .update({ story_date: storyDate, title, content, updated_at: new Date().toISOString() })
      .eq("id", storyId)
      .eq("author_id", currentUser.id)
      .select("id")
      .maybeSingle();

    if (error) {
      $("#storyFormError").textContent = error.message;
      submit.disabled = false;
      submit.textContent = "Lưu thay đổi ❤️";
      return;
    }
    if (!updated) {
      $("#storyFormError").textContent = "Không thể cập nhật: tài khoản hiện tại không phải người tạo kỷ niệm này.";
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

    const imageErrors = await uploadNewImages(storyId, files);
    if (imageErrors.length) {
      $("#storyFormError").textContent = "Một số ảnh chưa lưu được: " + imageErrors.join(" | ");
      submit.disabled = false;
      submit.textContent = "Lưu thay đổi ❤️";
      await loadStories();
      return;
    }
  }

  submit.disabled = false;
  resetStoryDialog();
  $("#storyForm").reset();
  $("#storyDialog").close();
  await loadStories();
});

async function uploadNewImages(storyId, files) {
  const errors = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = currentCoupleId + "/" + storyId + "/" + crypto.randomUUID() + "." + ext;

    const upload = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type || "application/octet-stream"
    });

    if (upload.error) {
      console.error("Image upload failed:", upload.error);
      errors.push(file.name + ": " + (upload.error.message || "Không thể tải ảnh lên Storage"));
      continue;
    }

    const imageInsert = await supabase.from("story_images").insert({
      story_id: storyId,
      couple_id: currentCoupleId,
      storage_path: path,
      sort_order: i
    });

    if (imageInsert.error) {
      console.error("Image record insert failed:", imageInsert.error);
      errors.push(file.name + ": " + (imageInsert.error.message || "Không thể lưu ảnh vào cơ sở dữ liệu"));
      await supabase.storage.from(IMAGE_BUCKET).remove([path]);
    }
  }
  return errors;
}

supabase.auth.onAuthStateChange(async (_event, session) => {
  currentUser = session?.user || null;

  // On mobile browsers, the restored Supabase session can arrive after
  // the initial page load. Always resolve the couple membership again
  // before loading the timeline; otherwise the timeline can be cleared
  // while the gallery (which performs its own membership lookup) still works.
  await loadMembership();
  await setupRealtime();
  updateAuthUI();
  await loadStories();
});

loadUser();
