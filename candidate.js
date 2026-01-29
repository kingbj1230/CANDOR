// 후보자 상세 + 후보자별 커뮤니티
const SUPABASE_URL = "https://txumpkghskgiprwqpigg.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4dW1wa2doc2tnaXByd3FwaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzU1MDksImV4cCI6MjA4MzM1MTUwOX0.kpChb4rlwOU_q8_q9DMn_0ZbOizhmwsjl4rjA9ZCQWk";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const qs = (sel) => document.querySelector(sel);

const badgeByRate = (rate) => {
  if (rate >= 70) return { text: "이행 중", cls: "success" };
  if (rate >= 40) return { text: "진행 대기", cls: "info" };
  return { text: "이행 실패", cls: "danger" };
};

let userProfile = null;
const state = {
  candidateId: null,
  user: null,
  mode: "login",
  candidate: null,
  pledges: [],
  posts: [],
  commentsByPost: {},
};

function isAdmin() {
  return userProfile?.role === "admin";
}

function getCandidateIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function getCandidateNameFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("name");
}

async function loadUserProfile() {
  if (!state.user) {
    userProfile = null;
    return;
  }
  const { data, error } = await supabaseClient.from("user_profiles").select("*").eq("user_id", state.user.id).maybeSingle();
  if (error) {
    console.error("[loadUserProfile error]", error);
    userProfile = null;
    return;
  }
  userProfile = data || null;
}

async function loadCandidateDetail() {
  let id = state.candidateId;
  const nameFromUrl = getCandidateNameFromUrl();
  if (!id && nameFromUrl) {
    // fallback: name으로 후보 찾기
    const { data: byName, error: byNameErr } = await supabaseClient.from("candidates").select("*").eq("name", nameFromUrl).maybeSingle();
    if (byNameErr) throw byNameErr;
    if (!byName) throw new Error("후보자를 찾을 수 없습니다.");
    id = byName.id;
    state.candidateId = id;
  }
  if (!id) return;

  const [{ data: cand, error: candErr }, { data: rateRow, error: rateErr }, { data: pledges, error: pledgeErr }] = await Promise.all([
    supabaseClient.from("candidates").select("*").eq("id", id).maybeSingle(),
    supabaseClient.from("candidate_fulfillment").select("*").eq("id", id).maybeSingle(),
    supabaseClient.from("pledges").select("*").eq("candidate_id", id).order("created_at", { ascending: false }),
  ]);

  if (candErr) throw candErr;
  if (!cand) throw new Error("후보자를 찾을 수 없습니다.");
  if (rateErr) console.warn("[candidate_fulfillment error]", rateErr);
  if (pledgeErr) console.warn("[pledges error]", pledgeErr);

  // 후보 승인 상태는 index와 동일하게: 일반 유저는 approved만 접근 권장
  const moderationStatus = ["pending", "approved", "rejected"].includes(cand.status) ? cand.status : "approved";
  if (!isAdmin() && moderationStatus !== "approved") {
    throw new Error("아직 공개되지 않은 후보자입니다.");
  }

  const progress = Math.round(rateRow?.avg_fulfillment_rate ?? 0);
  state.candidate = {
    id: cand.id,
    name: cand.name,
    party: cand.party || "무소속",
    position: cand.position,
    election_year: cand.election_year,
    region: cand.region,
    photo_url: cand.photo_url,
    description: cand.description,
    progress,
    badge: badgeByRate(progress),
  };

  const visiblePledges = (pledges || []).filter((p) => {
    const pMod = ["pending", "approved", "rejected"].includes(p.status) ? p.status : "approved";
    return isAdmin() ? true : pMod === "approved";
  });

  state.pledges = visiblePledges.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    category: p.category,
    fulfillment_rate: typeof p.fulfillment_rate === "number" ? p.fulfillment_rate : null,
    fulfillment_status: p.fulfillment_status || p.status || null,
  }));
}

function renderCandidate() {
  const c = state.candidate;
  if (!c) return;

  qs("#candidateName").textContent = c.name;

  qs("#candidateMeta").textContent = `${c.party} · ${c.position || "직책 미정"} · ${c.election_year || "연도 미정"} · ${c.region || "지역 미정"}`;
  qs("#candidateDescription").textContent = c.description || "후보자 소개가 없습니다.";

  const avatar = qs("#candidateAvatar");
  if (c.photo_url) {
    avatar.innerHTML = `<img src="${c.photo_url}" alt="${c.name}" style="width:100%; height:100%; object-fit:cover; border-radius:14px;" />`;
  } else {
    avatar.textContent = c.name.slice(0, 2);
  }

  qs("#candidateProgressBar").style.width = `${c.progress}%`;
  qs("#candidateProgressText").textContent = `${c.progress}%`;
  qs("#candidatePledgeCount").textContent = String(state.pledges.length);

  // 공약 렌더 (클릭 시 상세 펼침)
  const pledgesList = qs("#pledgesList");
  pledgesList.innerHTML = "";
  if (!state.pledges.length) {
    pledgesList.innerHTML = `<p class="subtitle">등록된 공약이 없습니다.</p>`;
  } else {
    const pledgeStatusPill = (fulfillment_status) => {
      // DB에 따라 status/fulfillment_status가 섞여 들어올 수 있어 보수적으로 처리
      if (fulfillment_status === "이행") return { text: "Completed", cls: "success" };
      if (fulfillment_status === "미이행") return { text: "Failed", cls: "danger" };
      // default: 부분이행 / 기타
      return { text: "In Progress", cls: "info" };
    };

    pledgesList.innerHTML = state.pledges
      .map((p) => {
        const rateText = typeof p.fulfillment_rate === "number" ? `${p.fulfillment_rate}%` : "-";
        const cat = p.category ? `<span class="pill neutral">${p.category}</span>` : "";
        const st = pledgeStatusPill(p.fulfillment_status);
        const desc = p.description ? `<p class="subtitle" style="margin:8px 0 0;">${p.description}</p>` : `<p class="subtitle" style="margin:8px 0 0;">설명이 없습니다.</p>`;
        return `
          <div class="pledge-accordion" data-pledge-id="${p.id}" style="border:1px solid var(--border); border-radius:12px; padding:14px; margin-top:10px; background: rgba(255,255,255,0.03);">
            <div class="pledge-accordion__top" style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
              <div style="flex:1; min-width: 200px;">
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                  <strong style="font-size:18px; color:#e6ebff;">${p.title}</strong>
                  ${cat}
                  <span class="pill ${st.cls}">${st.text}</span>
                </div>
                <p class="caption" style="margin:8px 0 0;">이행률: ${rateText}</p>
              </div>
              <span class="pill info" data-pledge-toggle="${p.id}">상세 보기</span>
            </div>
            <div class="pledge-accordion__detail" data-pledge-detail="${p.id}" style="display:none; margin-top:10px;">
              ${desc}
            </div>
          </div>
        `;
      })
      .join("");
  }

  // 커뮤니티 상단 공약 태그 셀렉트
  const pledgeSel = qs("#candidatePledgeSelect");
  pledgeSel.innerHTML = `<option value="">(선택) 공약 태그</option>` + state.pledges.map((p) => `<option value="${p.id}">${p.title}</option>`).join("");
}

async function loadCommunityForCandidate() {
  const id = state.candidateId;
  const { data: postData, error: postErr } = await supabaseClient
    .from("posts")
    .select("*")
    .eq("is_active", true)
    .eq("candidate_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (postErr) throw postErr;
  state.posts = postData || [];

  const postIds = state.posts.map((p) => p.id);
  state.commentsByPost = {};
  if (!postIds.length) return;

  const { data: commentData, error: commentErr } = await supabaseClient
    .from("comments")
    .select("*")
    .eq("is_active", true)
    .in("post_id", postIds)
    .order("created_at", { ascending: true });

  if (commentErr) throw commentErr;
  (commentData || []).forEach((c) => {
    if (!state.commentsByPost[c.post_id]) state.commentsByPost[c.post_id] = [];
    state.commentsByPost[c.post_id].push(c);
  });
}

function renderPosts() {
  const container = qs("#postList");
  container.innerHTML = "";

  if (!state.posts.length) {
    container.innerHTML = `<p class="subtitle">아직 작성된 글이 없습니다. 첫 글을 남겨보세요.</p>`;
    return;
  }

  state.posts.forEach((p) => {
    const lines = (p.content || "").split("\n");
    const title = lines[0] || "(제목 없음)";
    const bodyPreview = lines.slice(1).join(" ").trim().slice(0, 160);
    const createdAt = (p.created_at || "").slice(0, 10);
    const author = p.user_id ? `${String(p.user_id).slice(0, 8)}…` : "익명";

    const pledgeTitle = p.pledge_id ? state.pledges.find((x) => x.id === p.pledge_id)?.title : null;
    const tagHtml = pledgeTitle ? `<span class="pill neutral">공약 · ${pledgeTitle}</span>` : "";

    const comments = state.commentsByPost[p.id] || [];
    const div = document.createElement("div");
    div.className = "card post";
    div.innerHTML = `
      <div class="post__header">
        <div>
          <h4 style="margin:0; font-size:16px;">${title}</h4>
          <div class="post__meta">${author} · ${createdAt} · 댓글 ${comments.length}</div>
        </div>
        <span class="pill neutral">토론</span>
      </div>
      <div class="pill-row">${tagHtml}</div>
      <p class="subtitle">${bodyPreview || ""}</p>
      <div class="comments" data-post-id="${p.id}">
        <ul class="comment-list">
          ${comments
            .map((c) => {
              const cDate = (c.created_at || "").slice(0, 10);
              return `<li><span class="comment-content">${c.content}</span><span class="comment-meta">${cDate}</span></li>`;
            })
            .join("")}
        </ul>
        <div class="comment-form">
          <textarea rows="2" placeholder="댓글을 입력하세요" data-comment-input="${p.id}"></textarea>
          <button class="btn ghost" data-comment-submit="${p.id}">댓글 달기</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

async function createPost({ title, body, pledge_id = null }) {
  if (!state.user) throw new Error("로그인이 필요합니다.");
  const content = `${title}\n\n${body}`;
  const { data, error } = await supabaseClient
    .from("posts")
    .insert([
      {
        user_id: state.user.id,
        content,
        candidate_id: state.candidateId,
        pledge_id: pledge_id || null,
        is_active: true,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function createComment(post_id, content) {
  if (!state.user) throw new Error("로그인이 필요합니다.");
  const { data, error } = await supabaseClient
    .from("comments")
    .insert([
      {
        post_id,
        user_id: state.user.id,
        content,
        is_active: true,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data;
}

function openAuthModal(mode = "login") {
  state.mode = mode;
  qs("#modalTitle").textContent = mode === "login" ? "로그인" : "회원가입";
  qs("#authModal").classList.add("show");
  qs("#authModal").setAttribute("aria-hidden", "false");
}

function closeAuthModal() {
  qs("#authModal").classList.remove("show");
  qs("#authModal").setAttribute("aria-hidden", "true");
}

async function handleAuth() {
  const email = qs("#authEmail").value.trim();
  const password = qs("#authPassword").value.trim();
  if (!email || !password) {
    alert("이메일과 비밀번호를 입력하세요.");
    return;
  }
  if (password.length < 6) {
    alert("비밀번호는 6자 이상이어야 합니다.");
    return;
  }
  try {
    if (state.mode === "signup") {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      alert("회원가입 요청 완료! 이메일 인증이 필요할 수 있어요.");
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    closeAuthModal();
  } catch (err) {
    console.error("[auth error]", err);
    alert(`오류: ${err?.message ?? "인증 실패"}`);
  }
}

function bindEvents() {
  // auth
  qs("#loginBtn").addEventListener("click", async () => {
    if (state.user) {
      await supabaseClient.auth.signOut();
      return;
    }
    openAuthModal("login");
  });
  qs("#signupBtn").addEventListener("click", () => openAuthModal("signup"));
  qs("#closeModal").addEventListener("click", closeAuthModal);
  qs("#authSubmit").addEventListener("click", handleAuth);
  qs("#authModal").addEventListener("click", (e) => {
    if (e.target.id === "authModal") closeAuthModal();
  });

  // 공약 상세 펼치기
  qs("#pledgesList").addEventListener("click", (e) => {
    const toggleId = e.target.getAttribute("data-pledge-toggle") || e.target.closest("[data-pledge-toggle]")?.getAttribute("data-pledge-toggle");
    const card = e.target.closest("[data-pledge-id]");
    const id = toggleId || card?.getAttribute("data-pledge-id");
    if (!id) return;

    const detail = qs(`[data-pledge-detail="${id}"]`);
    if (!detail) return;
    const isOpen = detail.style.display !== "none";
    detail.style.display = isOpen ? "none" : "block";

    const pill = qs(`[data-pledge-toggle="${id}"]`);
    if (pill) pill.textContent = isOpen ? "상세 보기" : "닫기";
  });

  // 커뮤니티 글쓰기
  qs("#postSubmit").addEventListener("click", async () => {
    const title = qs("#postTitle").value.trim();
    const body = qs("#postContent").value.trim();
    const pledge_id = qs("#candidatePledgeSelect").value || null;

    if (!title || !body) {
      alert("제목과 내용을 입력하세요.");
      return;
    }
    if (!state.user) {
      alert("게시글 작성을 위해 로그인이 필요합니다.");
      openAuthModal("login");
      return;
    }

    try {
      await createPost({ title, body, pledge_id });
      qs("#postTitle").value = "";
      qs("#postContent").value = "";
      await loadCommunityForCandidate();
      renderPosts();
    } catch (err) {
      console.error("[createPost error]", err);
      alert(`오류: ${err?.message ?? "게시글 작성 실패"}`);
    }
  });

  // 댓글 작성 (이벤트 위임)
  qs("#postList").addEventListener("click", async (e) => {
    const postId = e.target.getAttribute("data-comment-submit");
    if (!postId) return;
    if (!state.user) {
      alert("댓글 작성을 위해 로그인이 필요합니다.");
      openAuthModal("login");
      return;
    }

    const textarea = qs(`textarea[data-comment-input="${postId}"]`);
    if (!textarea) return;
    const content = textarea.value.trim();
    if (!content) {
      alert("댓글 내용을 입력하세요.");
      return;
    }

    try {
      await createComment(postId, content);
      textarea.value = "";
      await loadCommunityForCandidate();
      renderPosts();
    } catch (err) {
      console.error("[createComment error]", err);
      alert(`오류: ${err?.message ?? "댓글 작성 실패"}`);
    }
  });
}

async function initAuth() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  state.user = session?.user ?? null;
  await loadUserProfile();

  supabaseClient.auth.onAuthStateChange(async (_event, session2) => {
    state.user = session2?.user ?? null;
    await loadUserProfile();
  });
}

async function init() {
  state.candidateId = getCandidateIdFromUrl();
  const candidateName = getCandidateNameFromUrl();
  if (!state.candidateId && !candidateName) {
    qs("#loadingState").style.display = "none";
    qs("#errorState").style.display = "block";
    qs("#errorMessage").textContent = "후보자 ID가 없습니다. 후보자 목록에서 다시 들어와 주세요.";
    return;
  }

  bindEvents();
  await initAuth();

  try {
    await loadCandidateDetail();
    await loadCommunityForCandidate();

    qs("#loadingState").style.display = "none";
    qs("#candidateDetail").style.display = "block";
    renderCandidate();
    renderPosts();
  } catch (err) {
    console.error("[candidate init error]", err);
    qs("#loadingState").style.display = "none";
    qs("#errorState").style.display = "block";
    qs("#errorMessage").textContent = err?.message ?? "후보자 정보를 불러오지 못했습니다.";
  }
}

document.addEventListener("DOMContentLoaded", init);

