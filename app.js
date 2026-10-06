import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./supabase/config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = s => document.querySelector(s);

function esc(v="") {
  return String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

let currentUser = null;

async function loadUser() {
  const { data } = await supabase.auth.getUser();
  currentUser = data.user || null;
  updateAuthUI();
  await loadStories();
}

function updateAuthUI() {
  $("#authBtn").textContent = currentUser ? "Đăng xuất" : "Đăng nhập";
  $("#addStoryBtn").disabled = !currentUser;
  $("#modeText").textContent = currentUser ? "Đã đăng nhập: " + (currentUser.email || "") : "Chế độ xem — cần đăng nhập để thêm";
}

async function loadStories() {
  const { data, error } = await supabase
    .from("stories")
    .select("id, story_date, title, content, created_at, author_id")
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
  $("#storyCount").textContent = stories.length;
  $("#emptyState").hidden = stories.length > 0;

  $("#timeline").innerHTML = stories.map(s => {
    const d = new Date(s.story_date + "T00:00:00").toLocaleDateString("vi-VN", {
      day: "2-digit", month: "2-digit", year: "numeric"
    });
    return `<article class="story">
      <div class="story-date">${d}</div>
      <h3>${esc(s.title)}</h3>
      <p>${esc(s.content)}</p>
      <div class="story-author">❤️ ${s.author_id === currentUser?.id ? "Bạn" : "Người ấy"}</div>
    </article>`;
  }).join("");
}

$("#addStoryBtn").onclick = () => {
  if (!currentUser) return $("#authDialog").showModal();
  $("#storyDate").value = new Date().toISOString().slice(0, 10);
  $("#storyDialog").showModal();
};

$("#closeDialog").onclick = () => $("#storyDialog").close();
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
  const submit = e.submitter;

  submit.disabled = true;
  submit.textContent = "Đang lưu…";

  const { error } = await supabase.from("stories").insert({
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

  $("#storyFormError").textContent = "";
  e.target.reset();
  $("#storyDialog").close();
  await loadStories();
});

supabase.auth.onAuthStateChange(async (_event, session) => {
  currentUser = session?.user || null;
  updateAuthUI();
  await loadStories();
});

loadUser();
