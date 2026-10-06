import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase/config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = s => document.querySelector(s);
const IMAGE_BUCKET = "story-images";

let currentUser = null;
let currentCoupleId = null;

function esc(v = "") {
  return String(v).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

async function loadUser() {
  const { data } = await supabase.auth.getUser();
  currentUser = data.user || null;
  currentCoupleId = null;

  if (currentUser) {
    const { data: membership } = await supabase
      .from("couple_members")
      .select("couple_id")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    currentCoupleId = membership?.couple_id || null;
  }

  updateAuthUI();
  await loadGallery();
}

function updateAuthUI() {
  $("#authBtn").textContent = currentUser ? "Đăng xuất" : "Đăng nhập";
  $("#modeText").textContent = currentUser
    ? "Album riêng của Hùng × Anh"
    : "Cần đăng nhập để xem ảnh";
}

async function loadGallery() {
  if (!currentUser || !currentCoupleId) {
    $("#galleryGrid").innerHTML = "";
    $("#photoCount").textContent = "0";
    $("#galleryEmpty").hidden = false;
    return;
  }

  const { data, error } = await supabase
    .from("story_images")
    .select("id, story_id, storage_path, sort_order, stories!inner(title, story_date)")
    .eq("couple_id", currentCoupleId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    $("#galleryGrid").innerHTML = "<p class='muted'>Không tải được album ảnh.</p>";
    return;
  }

  const photos = [];
  for (const row of data || []) {
    const signed = await supabase.storage.from(IMAGE_BUCKET)
      .createSignedUrl(row.storage_path, 3600);
    if (signed.error) continue;

    photos.push({
      ...row,
      url: signed.data.signedUrl,
      title: row.stories?.title || "Kỷ niệm",
      date: row.stories?.story_date || ""
    });
  }

  $("#photoCount").textContent = photos.length;
  $("#galleryEmpty").hidden = photos.length > 0;

  $("#galleryGrid").innerHTML = photos.map((p, index) => {
    const date = p.date
      ? new Date(p.date + "T00:00:00").toLocaleDateString("vi-VN")
      : "";
    return `<article class="gallery-card">
      <img src="${p.url}" alt="${esc(p.title)}" loading="lazy" data-photo-index="${index}">
      <div class="gallery-meta">
        <strong>${esc(p.title)}</strong>
        <span>${date}</span>
      </div>
    </article>`;
  }).join("");

  document.querySelectorAll("[data-photo-index]").forEach(img => {
    img.onclick = () => {
      const photo = photos[Number(img.dataset.photoIndex)];
      $("#lightboxImage").src = photo.url;
      $("#lightboxImage").alt = photo.title;
      $("#lightbox").classList.add("open");
    };
  });
}

$("#lightboxClose").onclick = () => $("#lightbox").classList.remove("open");
$("#lightbox").onclick = e => {
  if (e.target === $("#lightbox")) $("#lightbox").classList.remove("open");
};
document.addEventListener("keydown", e => {
  if (e.key === "Escape") $("#lightbox").classList.remove("open");
});

$("#closeAuth").onclick = () => $("#authDialog").close();

$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
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
  $("#authError").textContent = error
    ? error.message
    : "Đã tạo tài khoản. Nếu cần, hãy xác minh email.";
};

$("#authBtn").onclick = async () => {
  if (!currentUser) {
    $("#authDialog").showModal();
    return;
  }
  await supabase.auth.signOut();
  await loadUser();
};

supabase.auth.onAuthStateChange(async (_event, session) => {
  currentUser = session?.user || null;
  if (!currentUser) currentCoupleId = null;
  updateAuthUI();
  await loadGallery();
});

loadUser();
