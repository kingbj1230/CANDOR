// =========================
// Supabase 설정/클라이언트
// =========================
/*
  =========================================================
  DB 스키마 메모 (팀원/미래의 나를 위한 안내)
  =========================================================
  이 프로젝트는 Supabase(Postgres) 스키마를 기반으로 동작합니다.
  현재 프론트에서 "사용 중"인 컬럼 외에, DB에는 더 많은 컬럼/테이블이 있습니다.
  필요하면 아래 주석을 참고해서 기능을 확장하세요.

  [1] candidates (후보자)
    - 사용 중: id, name, party, position, election_year, region
    - 아직 미사용(확장 가능): photo_url(후보 사진), description(소개), created_at
      → 후보 카드에 사진/소개를 표시하거나 상세 페이지를 만들 때 사용하세요.

  [2] pledges (공약)
    - 사용 중: id, candidate_id, title, description, category, fulfillment_rate, status, created_at
    - 아직 미사용(확장 가능): source_id(평가 출처), (향후 updated_at 같은 컬럼 추가 가능)
      → source_id는 fulfillment_sources와 연결됩니다.

  [3] pledge_evidences (공약 증빙)
    - 사용 중(작성만): pledge_id, type, description, source_url
    - 아직 미사용(확장 가능): 화면에서 증빙 목록을 "조회/표시"하는 기능은 아직 없음
      → 공약 상세 모달/페이지에서 증빙 리스트를 렌더하면 좋아요.

  [4] fulfillment_sources (이행률 출처)
    - 미사용(확장 가능): pledges.source_id가 참조
      → "자체평가/시민평가/외부보고서" 같은 출처 선택 UI를 추가할 때 사용하세요.

  [5] candidate_fulfillment (VIEW)
    - 사용 중: id(candidate_id), avg_fulfillment_rate
      → 후보 progress(평균 이행률) 계산에 사용 중

  [6] posts (커뮤니티 게시글)
    - 사용 중: id, user_id(auth.users), content, is_active, created_at
    - 아직 미사용(확장 가능): candidate_id(후보 토론), pledge_id(공약 토론), updated_at
      → 후보/공약 카드에서 "토론하기" 버튼을 만들어 candidate_id/pledge_id를 넣으면
        후보별/공약별 커뮤니티를 쉽게 만들 수 있어요.

  [7] comments (댓글)
    - 사용 중: id, post_id, user_id(auth.users), content, is_active, created_at
    - 아직 미사용(확장 가능): updated_at (댓글 편집 기능에 활용)

  [8] profiles (프로필 - 레거시)
    - 미사용(확장 가능): 기존 profiles 테이블은 user_profiles로 대체됨
      → 필요시 user_profiles와 병합하거나 별도 닉네임/설정 테이블로 활용 가능

  [9] user_profiles (권한/역할/기여도)
    - 사용 중: user_id, role(user/admin/moderator), status(active/suspended/banned), reputation_score
    - 역할 기반 권한 체계:
      * user: 일반 유저 (후보/공약 등록 → 승인 대기)
      * contributor: 기여자 (reputation_score ≥ N, 자동 승격 가능)
      * admin: 관리자 (승인/반려/삭제/계정 관리)
    - 아직 미사용(확장 가능): moderator 역할, status 기반 제재 UI

  [10] bookmarks (북마크)
    - 사용 중: user_id, target_type(candidate/pledge), target_id, created_at
    - 아직 미사용(확장 가능): 별도 폴더/태그/메모 기능(추가 테이블로 확장 가능)

  보안 주의:
    - 프론트에는 anon key만 사용하세요. service_role 키는 절대 노출 금지입니다.
    - RLS(Row Level Security) 정책이 없거나 막혀 있으면 select/insert가 실패합니다.
*/
// 주의: 아래 키는 "anon public key" 용도입니다. service_role 키는 절대 프론트에 넣으면 안 됩니다.
const SUPABASE_URL = "https://txumpkghskgiprwqpigg.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4dW1wa2doc2tnaXByd3FwaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NzU1MDksImV4cCI6MjA4MzM1MTUwOX0.kpChb4rlwOU_q8_q9DMn_0ZbOizhmwsjl4rjA9ZCQWk";

// index.html에서 불러온 UMD 번들의 전역 객체 window.supabase 사용
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// expose for other page-specific scripts
window.supabaseClient = supabaseClient;

// 권한 체계: user_profiles.role 기반
// - user: 일반 유저
// - contributor: 기여자 (reputation_score ≥ N)
// - admin: 관리자

let userProfile = null; // user_profiles 테이블 데이터

function isAdmin() {
  return userProfile?.role === "admin";
}

function isContributor() {
  return userProfile?.role === "contributor" || (userProfile?.reputation_score ?? 0) >= 5; // 임계값: 승인된 공약 5개 이상
}

function getUserRole() {
  if (!state.user) return null;
  return userProfile?.role || "user";
}

function getReputationScore() {
  return userProfile?.reputation_score ?? 0;
}

// 데모용 후보 데이터 (이름, 정당, 상태, 진행률, 공약 리스트)
// Supabase에서 아무 데이터도 못 가져올 때 fallback 으로 사용
const fallbackCandidates = [
  {
    name: "김민주",
    party: "바른미래",
    status: "progress",
    progress: 78,
    promises: [
      { title: "청년 주거 10만 호 공급", status: "progress" },
      { title: "기초연금 35만 원 상향", status: "progress" },
      { title: "중소기업 상생펀드 조성", status: "pending" },
    ],
  },
  {
    name: "이정국",
    party: "국민연합",
    status: "progress",
    progress: 64,
    promises: [
      { title: "디지털 교육 무상지원", status: "progress" },
      { title: "농업 직불금 확대", status: "pending" },
      { title: "탄소중립 로드맵 보완", status: "pending" },
    ],
  },
  {
    name: "박서연",
    party: "민생당",
    status: "pending",
    progress: 42,
    promises: [
      { title: "보육 교사 처우 개선", status: "progress" },
      { title: "재생에너지 투자 확대", status: "pending" },
      { title: "지방 균형 예산 증액", status: "pending" },
    ],
  },
  {
    name: "최강우",
    party: "개혁신당",
    status: "failed",
    progress: 25,
    promises: [
      { title: "부동산 세제 전면 개편", status: "failed" },
      { title: "도심 공원 확충", status: "pending" },
      { title: "대중교통 요금 동결", status: "progress" },
    ],
  },
  {
    name: "정소진",
    party: "녹색연대",
    status: "progress",
    progress: 71,
    promises: [
      { title: "친환경 차량 50만 대 보급", status: "progress" },
      { title: "플라스틱 제로 정책", status: "progress" },
      { title: "재생 숲 조성 프로젝트", status: "pending" },
    ],
  },
  {
    name: "윤재혁",
    party: "미래혁신",
    status: "pending",
    progress: 39,
    promises: [
      { title: "AI 규제 샌드박스", status: "pending" },
      { title: "스타트업 세액공제", status: "progress" },
      { title: "지역 창업 허브 20곳", status: "pending" },
    ],
  },
];

// 실제로 화면에서 사용할 후보 목록 (초기에는 fallback 사용, 이후 Supabase에서 가져오면 교체)
let candidates = [...fallbackCandidates];

// 커뮤니티 더미 게시글
const communityPosts = [
  {
    title: "김민주 후보 공약 업데이트",
    author: "civiclover",
    content: "주거 공급 이행률이 5% 상승했네요. 자료 첨부!",
    date: "2026-01-15",
  },
  {
    title: "이정국 후보 농업 정책 토론",
    author: "farmtalk",
    content: "직불금 확대안에 대한 의견을 모읍니다.",
    date: "2026-01-12",
  },
];

// 실제로 사용할 커뮤니티 데이터 (초기에는 더미 사용, 이후 Supabase에서 교체)
let posts = [...communityPosts];
let commentsByPost = {};
let fulfillmentSources = [];
let activeEvidencePledgeId = null;
let myBookmarks = [];
let myPosts = [];
let myComments = [];

// 테마주 더미 데이터
const themeStocks = [
  { name: "스마트모빌리티", symbols: ["SMEV", "ECO-RIDE"], note: "친환경 차량 보급 수혜 기대" },
  { name: "그린인프라", symbols: ["GREENEX", "SOLARIS"], note: "재생에너지 투자 확대 테마" },
  { name: "디지털교육", symbols: ["EDTECH", "LEARN-ON"], note: "무상 디지털 교육 정책 관련" },
];

// UI 상태 관리 (검색어, 필터, 저장 후보, 로그인 유저, 모달 모드)
const state = {
  search: "",
  filter: "all",
  user: null,
  mode: "login",
  community: {
    candidate_id: null,
    pledge_id: null,
  },
};

// 짧은 셀렉터 헬퍼
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

// UI state for mypage nickname editing
let mypageOriginalNickname = null;

// 공약/후보 상태별 라벨 정의
const badgeByStatus = {
  progress: { text: "이행 중", cls: "success" },
  pending: { text: "진행 대기", cls: "info" },
  failed: { text: "이행 실패", cls: "danger" },
};

// 공약 테이블의 상태(KR)를 UI 배지 상태로 매핑
const pledgeStatusToBadge = {
  이행: "progress",
  부분이행: "pending",
  미이행: "failed",
};

function getCandidateById(id) {
  return candidates.find((c) => c.id === id) || null;
}

function getCandidateNameById(id) {
  return getCandidateById(id)?.name || null;
}

function getPledgeById(pledgeId) {
  for (const c of candidates) {
    const p = (c.promises || []).find((x) => x.id === pledgeId);
    if (p) return p;
  }
  return null;
}

// =========================
// Supabase에서 후보 목록 불러오기
// =========================
async function loadCandidatesFromSupabase() {
  try {
    const [{ data: candData, error: candError }, { data: rateData, error: rateError }, { data: pledgeData, error: pledgeError }] =
      await Promise.all([
        supabaseClient.from("candidates").select("*").order("created_at", { ascending: false }),
        supabaseClient.from("candidate_fulfillment").select("*"),
        supabaseClient.from("pledges").select("*").order("created_at", { ascending: false }),
      ]);

    if (candError || rateError || pledgeError) {
      console.error("[supabase fetch error]", { candError, rateError, pledgeError });
      candidates = [...fallbackCandidates];
      return;
    }

    if (!candData || candData.length === 0) {
      console.info("[supabase candidates] 빈 결과, fallback 사용");
      candidates = [...fallbackCandidates];
      return;
    }

    const rateMap = (rateData || []).reduce((acc, r) => {
      acc[r.id] = Math.round(r.avg_fulfillment_rate ?? 0);
      return acc;
    }, {});

    const pledgesByCandidate = {};
    (pledgeData || []).forEach((p) => {
      // moderation_status: pending/approved/rejected (DB의 status)
      const moderation_status = ["pending", "approved", "rejected"].includes(p.status) ? p.status : "approved";
      // fulfillment_status: 이행/부분이행/미이행 (기존 표시 용도)
      const fulfillment_status = ["이행", "부분이행", "미이행"].includes(p.status)
        ? p.status
        : ["이행", "부분이행", "미이행"].includes(p.fulfillment_status)
        ? p.fulfillment_status
        : "부분이행";

      const badgeStatus = pledgeStatusToBadge[fulfillment_status] || "pending";
      const entry = {
        id: p.id,
        title: p.title,
        status: badgeStatus, // UI 표시용
        fulfillment_rate: p.fulfillment_rate ?? null,
        category: p.category,
        description: p.description,
        moderation_status,
      };
      pledgesByCandidate[p.candidate_id] = pledgesByCandidate[p.candidate_id] || [];
      pledgesByCandidate[p.candidate_id].push(entry);
    });

    const deriveCandidateStatus = (rate) => {
      if (rate >= 70) return "progress";
      if (rate >= 40) return "pending";
      return "failed";
    };

    // 일반 유저는 승인(approved)만 노출, 관리자는 전체 노출
    const visibleCandidates = isAdmin() ? candData : (candData || []).filter((c) => (c.status || "approved") === "approved");

    // DB 스키마 → 프론트에서 쓰는 구조로 매핑
    candidates = visibleCandidates.map((row) => {
      const progress = rateMap[row.id] ?? 0;
      const moderation_status = ["pending", "approved", "rejected"].includes(row.status) ? row.status : "approved";
      return {
        id: row.id,
        name: row.name,
        party: row.party || "무소속",
        position: row.position,
        election_year: row.election_year,
        region: row.region,
        photo_url: row.photo_url,
        description: row.description,
        status: deriveCandidateStatus(progress), // UI 진행률 배지
        moderation_status,
        progress,
        // 일반 유저는 승인된 공약만 노출
        promises: (pledgesByCandidate[row.id] || []).filter((p) => (isAdmin() ? true : (p.moderation_status || "approved") === "approved")),
      };
    });
  } catch (e) {
    console.error("[loadCandidatesFromSupabase] unexpected error", e);
    candidates = [...fallbackCandidates];
  }
}

// 후보 추가 (일반 유저는 status='pending'으로 시작, 관리자는 'approved' 가능)
async function createCandidate(payload) {
  // 일반 유저는 승인 대기 상태로 시작
  const finalPayload = {
    ...payload,
    status: payload.status || (isAdmin() ? "approved" : "pending"),
  };
  const { data, error } = await supabaseClient.from("candidates").insert([finalPayload]).select().single();
  if (error) throw error;
  // 로컬 state에도 즉시 반영 (관리자는 즉시 보이고, 일반 유저는 승인 전까지 안 보임)
  const mapped = {
    id: data.id,
    name: data.name,
    party: data.party || "무소속",
    position: data.position,
    election_year: data.election_year,
    region: data.region,
    photo_url: data.photo_url,
    description: data.description,
    status: "progress", // UI 진행률 배지용
    moderation_status: data.status || "pending",
    progress: 0,
    promises: [],
  };
  // 관리자만 즉시 리스트에 추가 (일반 유저는 승인 후에만 보임)
  if (isAdmin() || mapped.moderation_status === "approved") {
    candidates.unshift(mapped);
  }
  renderHighlight();
  renderCandidates();
  initStats();
  renderPledgeCandidateOptions();
  renderCommunityTargetOptions();
  return mapped;
}

// 공약 추가 (선택적 증빙 포함, 일반 유저는 status='pending'으로 시작)
async function createPledge(payload, evidence) {
  // 일반 유저는 승인 대기 상태로 시작 + 작성자 user_id 포함 (기여도 계산용)
  const finalPayload = {
    ...payload,
    status: payload.status || (isAdmin() ? "approved" : "pending"),
    user_id: state.user?.id || null, // 작성자 기록 (기여도 계산용)
  };
  // NOTE:
  // - 기존 스키마에는 pledges.user_id 컬럼이 없을 수 있습니다.
  // - 그 경우 insert가 실패하므로, user_id 없이 재시도하여 기능이 "깨지지 않게" 방어합니다.
  let inserted = await supabaseClient.from("pledges").insert([finalPayload]).select().single();
  if (inserted.error) {
    const msg = inserted.error?.message || "";
    const isMissingUserIdColumn = /column .*user_id.* does not exist/i.test(msg) || /user_id/i.test(msg);
    if (isMissingUserIdColumn) {
      const retryPayload = { ...payload, status: payload.status || (isAdmin() ? "approved" : "pending") };
      inserted = await supabaseClient.from("pledges").insert([retryPayload]).select().single();
    }
  }
  if (inserted.error) throw inserted.error;
  const data = inserted.data;

  // 증빙 입력이 있는 경우에만 추가
  const hasEvidence =
    evidence &&
    (evidence.type || evidence.description || evidence.source_url) &&
    (evidence.type?.trim() || evidence.description?.trim() || evidence.source_url?.trim());

  if (hasEvidence) {
    await supabaseClient.from("pledge_evidences").insert([
      {
        pledge_id: data.id,
        type: evidence.type || null,
        description: evidence.description || null,
        source_url: evidence.source_url || null,
      },
    ]);
  }

  // 로컬 state에 즉시 반영 (상태/배지 매핑)
  const moderation_status = data.status || "pending";
  const fulfillment_status = ["이행", "부분이행", "미이행"].includes(data.fulfillment_status) ? data.fulfillment_status : "부분이행";
  const badgeStatus = pledgeStatusToBadge[fulfillment_status] || "pending";
  const mapped = {
    id: data.id,
    title: data.title,
    status: badgeStatus, // UI 진행률 배지용
    moderation_status,
    fulfillment_rate: data.fulfillment_rate ?? null,
    category: data.category,
    description: data.description,
  };

  // 해당 후보에 공약 추가 (관리자만 즉시 보이고, 일반 유저는 승인 후에만 보임)
  const target = candidates.find((c) => c.id === data.candidate_id);
  if (target && (isAdmin() || moderation_status === "approved")) {
    target.promises = target.promises || [];
    target.promises.unshift(mapped);
    renderHighlight();
    renderCandidates();
    initStats();
  }

  renderCommunityTargetOptions();

  return mapped;
}

// 관리자: 상태 변경/삭제 (승인/반려/삭제)
async function adminUpdateCandidateStatus(id, action) {
  if (!isAdmin()) throw new Error("관리자만 가능합니다.");
  const moderation_status = action === "approve" ? "approved" : "rejected";
  const { data, error } = await supabaseClient.from("candidates").update({ status: moderation_status }).eq("id", id).select("id,status,user_id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("상태 변경에 실패했습니다. (권한/RLS 또는 대상 없음)");

  // 승인 시 approval_logs + contributor_stats RPC 호출
  if (action === "approve") {
    const candidateUserId = data?.user_id ?? null;

    try {
      await supabaseClient.from("approval_logs").insert([
        {
          target_type: "candidate",
          target_id: id,
          admin_id: state.user.id,
          action: "approve",
        },
      ]);
    } catch (logErr) {
      console.warn("[approval_logs insert error]", logErr);
      // 로그 실패해도 승인은 진행
    }

    // 후보 작성자 기여도 증가 (user_id가 있는 경우만)
    if (candidateUserId) {
      try {
        await supabaseClient.rpc("approve_candidate", { p_user_id: candidateUserId });
        console.log("[approve_candidate RPC] 호출 성공:", candidateUserId);
      } catch (rpcErr) {
        console.warn("[approve_candidate RPC] 호출 실패", rpcErr);
        // RPC 실패해도 승인 진행 (로그에만 기록)
      }
    }
  }

  await loadCandidatesFromSupabase();
  renderCommunityTargetOptions();
  renderHighlight();
  renderCandidates();
}

async function adminUpdatePledgeStatus(id, action) {
  if (!isAdmin()) throw new Error("관리자만 가능합니다.");
  const moderation_status = action === "approve" ? "approved" : "rejected";

  // 공약 작성자 user_id 조회 (기여도 업데이트용)
  let pledgeUserId = null;
  try {
    const { data: pledgeData, error: pledgeUserErr } = await supabaseClient.from("pledges").select("user_id").eq("id", id).maybeSingle();
    // user_id 컬럼이 없거나 RLS로 막히면 여기서 에러가 날 수 있음 → 기여도 업데이트만 스킵
    if (!pledgeUserErr) pledgeUserId = pledgeData?.user_id ?? null;
  } catch (e) {
    console.warn("[adminUpdatePledgeStatus] pledges.user_id 조회 실패 (스키마/RLS 확인 필요)", e);
    pledgeUserId = null;
  }

  const { data, error } = await supabaseClient.from("pledges").update({ status: moderation_status }).eq("id", id).select("id,status").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("상태 변경에 실패했습니다. (권한/RLS 또는 대상 없음)");

  // 승인 시 approval_logs + contributor_stats RPC 호출
  if (action === "approve") {
    try {
      // approval_logs 테이블이 없거나 RLS로 막히면 실패할 수 있음 → 승인은 진행
      await supabaseClient.from("approval_logs").insert([
        {
          target_type: "pledge",
          target_id: id,
          admin_id: state.user.id,
          action: "approve",
        },
      ]);
    } catch (logErr) {
      console.warn("[approval_logs insert error]", logErr);
      // 로그 실패해도 승인은 진행
    }

    // 공약 작성자 기여도 증가 (user_id가 있는 경우만)
    if (pledgeUserId) {
      try {
        await supabaseClient.rpc("approve_pledge", { p_user_id: pledgeUserId });
        console.log("[approve_pledge RPC] 호출 성공:", pledgeUserId);
      } catch (rpcErr) {
        console.warn("[approve_pledge RPC] 호출 실패", rpcErr);
        // RPC 실패해도 승인 진행 (로그에만 기록)
      }
    }
  }

  await loadCandidatesFromSupabase();
  // 승인된 공약 작성자의 user_profiles도 갱신
  if (pledgeUserId && action === "approve") {
    await loadUserProfile();
  }
  renderCommunityTargetOptions();
  renderHighlight();
  renderCandidates();
}

async function adminDeleteCandidate(id) {
  if (!isAdmin()) throw new Error("관리자만 가능합니다.");
  if (!confirm("정말로 후보를 삭제하시겠습니까?")) return false;
  if (!confirm("삭제하면 되돌릴 수 없습니다. 계속하시겠습니까?")) return false;
  const { data, error } = await supabaseClient.from("candidates").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("삭제에 실패했습니다. (권한/RLS 또는 대상 없음)");
  await loadCandidatesFromSupabase();
  renderCommunityTargetOptions();
  renderHighlight();
  renderCandidates();
  return true;
}

async function adminDeletePledge(id) {
  if (!isAdmin()) throw new Error("관리자만 가능합니다.");
  if (!confirm("정말로 공약을 삭제하시겠습니까?")) return false;
  if (!confirm("삭제하면 되돌릴 수 없습니다. 계속하시겠습니까?")) return false;
  const { data, error } = await supabaseClient.from("pledges").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("삭제에 실패했습니다. (권한/RLS 또는 대상 없음)");
  await loadCandidatesFromSupabase();
  renderCommunityTargetOptions();
  renderHighlight();
  renderCandidates();
  return true;
}

// 이행률 출처 목록 로드/렌더
async function loadFulfillmentSources() {
  try {
    const { data, error } = await supabaseClient.from("fulfillment_sources").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error("[fulfillment_sources error]", error);
      fulfillmentSources = [];
      return;
    }
    fulfillmentSources = data || [];
  } catch (e) {
    console.error("[loadFulfillmentSources] unexpected error", e);
    fulfillmentSources = [];
  }
}

function renderSourceOptions() {
  const sel = qs("#pledgeSourceSelect");
  if (!sel) return;

  const current = sel.value;
  sel.innerHTML = `
    <option value="">(선택) 이행률 출처</option>
    ${fulfillmentSources.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
    <option value="__new__">+ 출처 새로 만들기</option>
  `;
  if (current) sel.value = current;
}

function toggleNewSourceFields() {
  const sel = qs("#pledgeSourceSelect");
  const fields = qs("#newSourceFields");
  if (!sel || !fields) return;
  fields.style.display = sel.value === "__new__" ? "grid" : "none";
}

// 공약 증빙 조회/추가
async function loadEvidencesForPledge(pledgeId) {
  const { data, error } = await supabaseClient
    .from("pledge_evidences")
    .select("*")
    .eq("pledge_id", pledgeId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

function openEvidenceModal(pledgeId) {
  activeEvidencePledgeId = pledgeId;
  qs("#evidenceModal").classList.add("show");
  qs("#evidenceModal").setAttribute("aria-hidden", "false");
}

function closeEvidenceModal() {
  qs("#evidenceModal").classList.remove("show");
  qs("#evidenceModal").setAttribute("aria-hidden", "true");
  activeEvidencePledgeId = null;
  qs("#evidenceForm").reset();
  qs("#evidenceList").innerHTML = "";
}

async function renderEvidenceModal(pledgeId) {
  const pledge = getPledgeById(pledgeId);
  qs("#evidenceModalTitle").textContent = `공약 증빙 · ${pledge?.title || "선택된 공약"}`;
  const list = qs("#evidenceList");
  list.innerHTML = `<li class="subtitle">불러오는 중…</li>`;

  try {
    const evidences = await loadEvidencesForPledge(pledgeId);
    if (!evidences.length) {
      list.innerHTML = `<li class="subtitle">등록된 증빙이 없습니다.</li>`;
      return;
    }
    list.innerHTML = evidences
      .map((e) => {
        const url = e.source_url ? `<a class="evidence-url" href="${e.source_url}" target="_blank" rel="noreferrer">${e.source_url}</a>` : "";
        const date = (e.created_at || "").slice(0, 10);
        return `
          <li class="evidence-item">
            <div class="evidence-top">
              <span class="pill neutral">${e.type || "기타"}</span>
              <span class="caption">${date}</span>
            </div>
            ${e.description ? `<div>${e.description}</div>` : ""}
            ${url}
          </li>
        `;
      })
      .join("");
  } catch (err) {
    console.error("[renderEvidenceModal error]", err);
    list.innerHTML = `<li class="subtitle">증빙을 불러오지 못했습니다.</li>`;
  }
}

async function handleEvidenceSubmit(e) {
  e.preventDefault();
  if (!activeEvidencePledgeId) return;

  const type = qs("#evidenceAddType").value || null;
  const source_url = qs("#evidenceAddUrl").value.trim() || null;
  const description = qs("#evidenceAddDescription").value.trim() || null;

  if (!type && !source_url && !description) {
    alert("증빙 내용을 하나 이상 입력하세요.");
    return;
  }

  try {
    const { error } = await supabaseClient.from("pledge_evidences").insert([
      {
        pledge_id: activeEvidencePledgeId,
        type,
        source_url,
        description,
      },
    ]);
    if (error) throw error;

    qs("#evidenceForm").reset();
    await renderEvidenceModal(activeEvidencePledgeId);
  } catch (err) {
    console.error("[handleEvidenceSubmit error]", err);
    const msg = err?.message ?? "증빙 추가에 실패했습니다.";
    alert(`오류: ${msg}`);
  }
}

// 커뮤니티: 게시글/댓글 로드
async function loadCommunity() {
  try {
    const [{ data: postData, error: postError }, { data: commentData, error: commentError }] = await Promise.all([
      supabaseClient
        .from("posts")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseClient
        .from("comments")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
    ]);

    if (postError || commentError) {
      console.error("[supabase community fetch error]", { postError, commentError });
      posts = [...communityPosts];
      commentsByPost = {};
      return;
    }

    posts = postData || [];
    commentsByPost = {};
    (commentData || []).forEach((c) => {
      if (!commentsByPost[c.post_id]) commentsByPost[c.post_id] = [];
      commentsByPost[c.post_id].push(c);
    });
  } catch (e) {
    console.error("[loadCommunity] unexpected error", e);
    posts = [...communityPosts];
    commentsByPost = {};
  }
}

// 커뮤니티: 게시글 생성
async function createPost({ content, candidate_id = null, pledge_id = null }) {
  if (!state.user) throw new Error("로그인이 필요합니다.");
  // 파일 업로드는 선택적임. content 객체로 확장 가능
  const payload = {
    user_id: state.user.id,
    content,
    candidate_id,
    pledge_id,
    is_active: true,
  };

  // 시도: 파일 URL이 content에 포함되어 있으면 posts에 전달
  if (typeof content === "object" && content.file_url) {
    payload.file_url = content.file_url;
    // content 텍스트로 변환
    payload.content = content.text || "";
  }

  let inserted = await supabaseClient.from("posts").insert([payload]).select().single();
  if (inserted.error) {
    // DB 스키마에 file_url 컬럼이 없을 경우 대비: file_url 없이 재시도
    const msg = inserted.error?.message || "";
    if (/column .*file_url.* does not exist/i.test(msg)) {
      const retryPayload = { ...payload };
      delete retryPayload.file_url;
      inserted = await supabaseClient.from("posts").insert([retryPayload]).select().single();
    }
  }
  if (inserted.error) throw inserted.error;

  const data = inserted.data;
  posts.unshift(data);
  commentsByPost[data.id] = [];
  renderPosts();
  return data;
}

// 파일을 Supabase 스토리지에 업로드하고 public URL 반환 (없으면 null)
async function uploadFileToStorage(file) {
  if (!file) return null;
  try {
    const key = `posts/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { error: uploadErr } = await supabaseClient.storage.from("post-uploads").upload(key, file, { upsert: true });
    if (uploadErr) {
      console.warn("[uploadFileToStorage] upload error", uploadErr);
      return null;
    }
    const { data: urlData } = supabaseClient.storage.from("post-uploads").getPublicUrl(key);
    return urlData?.publicUrl || null;
  } catch (e) {
    console.error("[uploadFileToStorage]", e);
    return null;
  }
}

async function updatePost(postId, newContent) {
  if (!state.user) throw new Error("로그인이 필요합니다.");
  const { data, error } = await supabaseClient.from("posts").update({ content: newContent }).eq("id", postId).select().maybeSingle();
  if (error) throw error;
  // 로컬 반영
  posts = posts.map((p) => (p.id === postId ? { ...p, content: newContent } : p));
  renderPosts();
  return data;
}

async function deletePost(postId) {
  if (!state.user) throw new Error("로그인이 필요합니다.");
  const { data, error } = await supabaseClient.from("posts").delete().eq("id", postId).select().maybeSingle();
  if (error) throw error;
  posts = posts.filter((p) => p.id !== postId);
  delete commentsByPost[postId];
  renderPosts();
  return data;
}

// 커뮤니티: 댓글 생성
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

  if (!commentsByPost[post_id]) commentsByPost[post_id] = [];
  commentsByPost[post_id].push(data);
  renderPosts();
  return data;
}

// 히어로 패널: 이행률 상위 후보 표시
// Hall of Fame 렌더러: `contributor_stats`의 집계 필드(`approved_candidates_count`, `approved_pledges_count`)를 사용해
// 상위 3명의 기여자(후보 승인 수 + 공약 승인 수 합)를 표시합니다.
async function renderHighlight() {
  const container = qs("#hofList");
  if (!container) return;

  try {
    // contributor_stats 테이블: user_id (uuid), approved_candidates_count (int4), approved_pledges_count (int4), last_approved_at
    // user_profiles와 LEFT JOIN하여 display name 가져오기
    const { data, error } = await supabaseClient
      .from("contributor_stats")
      .select(
        "user_id, approved_candidates_count, approved_pledges_count"
      );

    if (error) {
      console.warn("[HallOfFame] contributor_stats select failed", error);
      // 폴백: 클라이언트에서 candidates/pledges를 스캔하여 간단 집계를 시도합니다.
      const fallbackOk = await fallbackHallOfFameAggregation(container);
      if (fallbackOk) return;
      container.innerHTML = "<li>데이터를 불러오지 못했거나 활동 중인 기여자가 없습니다.</li>";
      return;
    }

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = "<li>활발한 기여자가 아직 없습니다. 첫 기여자가 되어보세요!</li>";
      return;
    }

    // 각 기여자의 총 기여 수 계산 (승인된 후보 수 + 승인된 공약 수)
    const entries = data.map((c) => {
      const candidatesCount = Number(c.approved_candidates_count || 0);
      const pledgesCount = Number(c.approved_pledges_count || 0);
      return {
        user_id: c.user_id,
        count: candidatesCount + pledgesCount,
      };
    });

    // 내림차순 정렬 후 상위 3명 선택
    entries.sort((a, b) => b.count - a.count);
    const top = entries.slice(0, 3);

    if (top.length === 0 || top[0].count === 0) {
      container.innerHTML = "<li>활발한 기여자가 아직 없습니다. 첫 기여자가 되어보세요!</li>";
      return;
    }

    // user_profiles에서 display name 가져오기 (optional)
    let displayNames = new Map();
    try {
      const userIds = top.map(e => e.user_id).filter(Boolean);
      if (userIds.length > 0) {
        const { data: profiles } = await supabaseClient
          .from("user_profiles")
          .select("user_id, nickname, username, full_name, email")
          .in("user_id", userIds);
        if (profiles) {
          profiles.forEach(p => {
            const display = p.nickname || p.username || p.full_name || p.email || String(p.user_id);
            displayNames.set(p.user_id, display);
          });
        }
      }
    } catch (e) {
      console.warn("[Hall of Fame] user_profiles 조회 실패, UUID로 표시합니다", e);
    }

    // 표시
    for (let i = 0; i < 3; i++) {
      const li = qs(`#hof-${i + 1}`);
      const e = top[i];
      if (!li) continue;
      if (!e) {
        li.textContent = `${i + 1}위: — (기여 0)`;
      } else {
        const display = displayNames.get(e.user_id) || e.user_id || "—";
        li.textContent = `${i + 1}위: ${display} (기여 ${e.count})`;
      }
    }
  } catch (err) {
    console.error("[renderHighlight -> HallOfFame]", err);
    container.innerHTML = "<li>데이터를 불러오지 못했거나 활동 중인 기여자가 없습니다.</li>";
  }
}

// 간단 폴백: `candidates`와 `pledges`를 조회해 작성자 ID 필드를 탐색하고 합산합니다.
async function fallbackHallOfFameAggregation(container) {
  try {
    const tables = ["candidates", "pledges"];
    const counts = new Map();

    for (const t of tables) {
      const { data, error } = await supabaseClient.from(t).select("id, user_id, author, author_id, created_by, nickname, full_name, email").limit(1000);
      if (error || !Array.isArray(data)) continue;
      data.forEach((row) => {
        const uid = row.user_id || row.author_id || row.author || row.created_by || null;
        const key = uid || (row.email ? `email:${row.email}` : null);
        if (!key) return;
        const prev = counts.get(key) || { count: 0, display: row.nickname || row.full_name || row.email || String(key) };
        prev.count += 1;
        counts.set(key, prev);
      });
    }

    if (counts.size === 0) return false;

    const entries = Array.from(counts.entries()).map(([k, v]) => ({ key: k, display: v.display, count: v.count }));
    entries.sort((a, b) => b.count - a.count);
    const top = entries.slice(0, 3);
    for (let i = 0; i < 3; i++) {
      const li = qs(`#hof-${i + 1}`);
      const e = top[i];
      if (!li) continue;
      if (!e) {
        li.textContent = `${i + 1}위: — (기여 0)`;
      } else {
        li.textContent = `${i + 1}위: ${e.display} (기여 ${e.count})`;
      }
    }
    return true;
  } catch (e) {
    console.warn('[fallbackHallOfFameAggregation] failed', e);
    return false;
  }
}

function renderCandidates() {
  const container = qs("#candidateList");
  container.innerHTML = "";
  const filtered = candidates.filter((c) => {
    const matchText = `${c.name}${c.party}`.toLowerCase().includes(state.search.toLowerCase());
    const matchStatus = state.filter === "all" ? true : c.status === state.filter;
    return matchText && matchStatus;
  });

  filtered.forEach((c) => {
    const card = document.createElement("div");
    const candidateId = c.id || null;
    const candidateName = c.name || null;
    card.className = "card candidate candidate-clickable";
    if (candidateId) card.setAttribute("data-candidate-id", candidateId);
    if (candidateName) card.setAttribute("data-candidate-name", candidateName);
    const modStatus = c.moderation_status || "approved";
    const modPill = isAdmin()
      ? modStatus === "approved"
        ? `<span class="pill success">승인</span>`
        : modStatus === "rejected"
        ? `<span class="pill danger">반려</span>`
        : `<span class="pill neutral">대기</span>`
      : "";
    card.innerHTML = `
      <div class="candidate__header">
        <div class="avatar">${c.name.slice(0, 2)}</div>
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <h3 style="margin:0;">${c.name}</h3>
            ${modPill}
          </div>
          <p class="candidate__meta">
            ${c.party || "무소속"} · ${c.position || "직책 미정"} · ${c.election_year || "연도 미정"} · ${
      c.region || "지역 미정"
    }
          </p>
        </div>
      </div>
      <div class="progress"><div class="progress__bar" style="width:${c.progress || 0}%;"></div></div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
        ${
          candidateId
            ? `<button class="btn ghost tiny" data-community-candidate="${candidateId}">후보 토론 보기</button>`
            : `<button class="btn ghost tiny" disabled title="데모 데이터(로컬)에서는 토론 필터를 사용할 수 없어요.">후보 토론 보기</button>`
        }
        ${
          candidateId
            ? `<button class="btn ghost tiny" data-bookmark-candidate="${candidateId}">${isBookmarked("candidate", candidateId) ? "북마크 해제" : "북마크"}</button>`
            : `<button class="btn ghost tiny" disabled title="데모 데이터(로컬)에서는 북마크를 사용할 수 없어요.">북마크</button>`
        }
        ${
          isAdmin()
            ? `
            <button class="btn ghost tiny" data-admin-approve-candidate="${candidateId || ""}" ${!candidateId || c.moderation_status === "approved" ? "disabled" : ""}>승인</button>
            <button class="btn ghost tiny" data-admin-reject-candidate="${candidateId || ""}" ${!candidateId || c.moderation_status === "rejected" ? "disabled" : ""}>반려</button>
            <button class="btn danger tiny" data-admin-delete-candidate="${candidateId || ""}" ${!candidateId ? "disabled" : ""}>삭제</button>
          `
            : ""
        }
      </div>
      <ul class="promise-list--compact">
        ${(c.promises || [])
          .map((p) => {
            const b = badgeByStatus[p.status] || badgeByStatus.progress;
            const pMod = p.moderation_status || "approved";
            const pModPill = isAdmin()
              ? pMod === "approved"
                ? `<span class="pill success">승인</span>`
                : pMod === "rejected"
                ? `<span class="pill danger">반려</span>`
                : `<span class="pill neutral">대기</span>`
              : "";
            const rateText = typeof p.fulfillment_rate === "number" ? ` · ${p.fulfillment_rate}%` : "";
            return `
              <li>
                <span>${p.title}</span>
                <span class="promise-actions">
                  <span class="pill ${b.cls}">${b.text}${rateText}</span>
                  ${pModPill}
                  <button class="btn ghost tiny" data-community-pledge="${p.id}">토론</button>
                  <button class="btn ghost tiny" data-evidence-pledge="${p.id}">증빙</button>
                  <button class="btn ghost tiny" data-bookmark-pledge="${p.id}">${isBookmarked("pledge", p.id) ? "북마크 해제" : "북마크"}</button>
                  ${
                    isAdmin()
                      ? `
                      <button class="btn ghost tiny" data-admin-approve-pledge="${p.id}" ${pMod === "approved" ? "disabled" : ""}>승인</button>
                      <button class="btn ghost tiny" data-admin-reject-pledge="${p.id}" ${pMod === "rejected" ? "disabled" : ""}>반려</button>
                      <button class="btn danger tiny" data-admin-delete-pledge="${p.id}">삭제</button>
                    `
                      : ""
                  }
                </span>
              </li>`;
          })
          .join("")}
      </ul>
      <!-- 기존 데모 "마이페이지에 저장"은 bookmarks로 대체됨 -->
    `;
    container.appendChild(card);
  });

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "subtitle";
    empty.textContent = "조건에 맞는 후보가 없습니다.";
    container.appendChild(empty);
  }

  // (구버전) data-save 버튼은 제거됨 — bookmarks로 대체
}

// 공약 추가 모달의 후보 셀렉트 옵션 렌더
function renderPledgeCandidateOptions() {
  const select = qs("#pledgeCandidateSelect");
  if (!select) return;
  select.innerHTML = `<option value="">후보자 선택 *</option>`;
  candidates.forEach((c) => {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = `${c.name} (${c.party || "무소속"})`;
    select.appendChild(option);
  });
}

function renderCommunityTargetOptions() {
  // 글쓰기용 후보/공약 셀렉트
  const postCandidateSel = qs("#postCandidateSelect");
  const postPledgeSel = qs("#postPledgeSelect");
  // 필터용 후보/공약 셀렉트
  const filterCandidateSel = qs("#communityFilterCandidate");
  const filterPledgeSel = qs("#communityFilterPledge");

  const buildCandidateOptions = () =>
    candidates.map((c) => `<option value="${c.id}">${c.name} (${c.party || "무소속"})</option>`).join("");

  if (postCandidateSel) {
    postCandidateSel.innerHTML = `<option value="">(선택) 후보자 토론</option>${buildCandidateOptions()}`;
  }
  if (filterCandidateSel) {
    filterCandidateSel.innerHTML = `<option value="">전체 후보</option>${buildCandidateOptions()}`;
  }

  const allPledges = [];
  candidates.forEach((c) => {
    (c.promises || []).forEach((p) => allPledges.push({ candidate: c, pledge: p }));
  });
  const pledgeOptions = allPledges
    .map((x) => `<option value="${x.pledge.id}">${x.candidate.name} · ${x.pledge.title}</option>`)
    .join("");

  if (postPledgeSel) postPledgeSel.innerHTML = `<option value="">(선택) 공약 토론</option>${pledgeOptions}`;
  if (filterPledgeSel) filterPledgeSel.innerHTML = `<option value="">전체 공약</option>${pledgeOptions}`;
}

// =========================
// 마이페이지 (user_profiles / bookmarks / 내 글/댓글)
// =========================
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
  // user_profiles가 없으면 기본값으로 생성 (RLS 정책에 따라 insert 가능해야 함)
  if (!userProfile && state.user) {
    try {
      const { data: newProfile, error: insertError } = await supabaseClient
        .from("user_profiles")
        .insert([{ user_id: state.user.id, role: "user", status: "active", reputation_score: 0 }])
        .select()
        .single();
      if (!insertError && newProfile) {
        userProfile = newProfile;
      }
    } catch (e) {
      console.warn("[loadUserProfile] 자동 생성 실패 (RLS 정책 확인 필요)", e);
    }
  }
}

async function loadMyBookmarks() {
  if (!state.user) {
    myBookmarks = [];
    return;
  }
  const { data, error } = await supabaseClient
    .from("bookmarks")
    .select("*")
    .eq("user_id", state.user.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[loadMyBookmarks error]", error);
    myBookmarks = [];
    return;
  }
  myBookmarks = data || [];
}

async function loadMyPosts() {
  if (!state.user) {
    myPosts = [];
    return;
  }
  const { data, error } = await supabaseClient
    .from("posts")
    .select("*")
    .eq("user_id", state.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[loadMyPosts error]", error);
    myPosts = [];
    return;
  }
  myPosts = data || [];
}

async function loadMyComments() {
  if (!state.user) {
    myComments = [];
    return;
  }
  const { data, error } = await supabaseClient
    .from("comments")
    .select("*")
    .eq("user_id", state.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[loadMyComments error]", error);
    myComments = [];
    return;
  }
  myComments = data || [];
}

function isBookmarked(target_type, target_id) {
  return myBookmarks.some((b) => b.target_type === target_type && b.target_id === target_id);
}

async function toggleBookmark(target_type, target_id) {
  if (!state.user) {
    alert("북마크를 사용하려면 로그인이 필요합니다.");
    openAuthModal("login");
    return;
  }

  const exists = myBookmarks.find((b) => b.target_type === target_type && b.target_id === target_id);
  try {
    if (exists) {
      const { error } = await supabaseClient.from("bookmarks").delete().eq("id", exists.id);
      if (error) throw error;
      myBookmarks = myBookmarks.filter((b) => b.id !== exists.id);
    } else {
      const { data, error } = await supabaseClient
        .from("bookmarks")
        .insert([{ user_id: state.user.id, target_type, target_id }])
        .select()
        .single();
      if (error) throw error;
      myBookmarks.unshift(data);
    }
    renderCandidates();
    renderMypage();
  } catch (err) {
    console.error("[toggleBookmark error]", err);
    alert(`오류: ${err?.message ?? "북마크 처리 실패"}`);
  }
}

async function refreshMypageData() {
  await Promise.all([loadUserProfile(), loadMyBookmarks(), loadMyPosts(), loadMyComments()]);
  renderMypage();
}

function renderMypage() {
  // 마이페이지 섹션이 없는 경우 함수 종료
  if (!qs("#mypage")) return;
  
  const email = state.user?.email ?? null;
  const mypageNameEl = qs("#mypageName");
  const mypageEmailEl = qs("#mypageEmail");
  if (mypageNameEl) mypageNameEl.textContent = state.user ? "마이페이지" : "로그인이 필요합니다";
  if (mypageEmailEl) mypageEmailEl.textContent = email ?? "-";

  // 역할 표시 (user / contributor / admin)
  const role = getUserRole();
  const roleText = role === "admin" ? "관리자" : role === "contributor" ? "기여자" : role === "user" ? "멤버" : "게스트";
  const badgeRoleEl = qs("#badgeRole");
  if (badgeRoleEl) badgeRoleEl.textContent = state.user ? roleText : "게스트";

  // 관리자/기여자 배지 표시
  const adminBadgeEl = qs("#adminBadge");
  const contributorBadgeEl = qs("#contributorBadge");
  if (adminBadgeEl) {
    adminBadgeEl.style.display = isAdmin() ? "inline-flex" : "none";
  }
  if (contributorBadgeEl) {
    contributorBadgeEl.style.display = isContributor() && !isAdmin() ? "inline-flex" : "none";
  }

  // 활동 수 / 기여 점수 표시
  const reputation = getReputationScore();
  const activityCount = (myPosts?.length || 0) + (myComments?.length || 0) + (myBookmarks?.length || 0);
  const badgeStatsEl = qs("#badgeStats");
  if (badgeStatsEl) badgeStatsEl.textContent = `활동 ${activityCount}`;
  const reputationBadgeEl = qs("#badgeReputation");
  if (reputationBadgeEl) {
    if (reputation > 0) {
      reputationBadgeEl.textContent = `기여 점수 ${reputation}`;
      reputationBadgeEl.style.display = "inline-flex";
    } else {
      reputationBadgeEl.style.display = "none";
    }
  }

  // 프로필 (닉네임은 profiles 테이블 또는 user_profiles 확장으로 분리 가능)
  const nicknameInput = qs("#mypageNickname");
  const saveNickBtn = qs("#saveNicknameBtn");
  const mypageCreatedAtEl = qs("#mypageCreatedAt");
  const profileHintEl = qs("#profileHint");

  if (!state.user) {
    if (nicknameInput) nicknameInput.value = "";
    if (nicknameInput) nicknameInput.disabled = true;
    if (saveNickBtn) saveNickBtn.disabled = true;
    const editBtn = qs('#editNicknameBtn'); if (editBtn) { editBtn.disabled = true; editBtn.style.display = 'none'; }
    if (saveNickBtn) saveNickBtn.style.display = 'none';
    if (mypageCreatedAtEl) mypageCreatedAtEl.textContent = "-";
    if (profileHintEl) profileHintEl.textContent = "로그인 후 프로필/활동/북마크를 확인할 수 있습니다.";
  } else {
    // no refresh button: keep controls enabled for logged-in users
    // 닉네임은 별도 profiles 테이블 또는 user_profiles 확장 필요 (현재는 임시로 이메일 앞부분 사용)
    if (nicknameInput) nicknameInput.value = email ? email.split("@")[0] : "";
    if (nicknameInput) nicknameInput.disabled = true; // user_profiles에 nickname 컬럼이 없으므로 비활성화
    if (saveNickBtn) { saveNickBtn.disabled = true; saveNickBtn.style.display = 'none'; }
    const editBtn = qs('#editNicknameBtn'); if (editBtn) { editBtn.disabled = false; editBtn.style.display = 'inline-block'; }
    // Prefer created_at from user_profiles, fallback to auth user.created_at
    const createdVal = userProfile?.created_at || state.user?.created_at || null;
    if (mypageCreatedAtEl) mypageCreatedAtEl.textContent = createdVal ? String(createdVal).slice(0, 10) : "-";
    if (profileHintEl) profileHintEl.textContent = `역할: ${roleText} | 기여 점수: ${reputation} | 상태: ${userProfile?.status || "active"}`;
  }

  // 북마크 후보/공약
  const candUl = qs("#bookmarkCandidates");
  const pledgeUl = qs("#bookmarkPledges");
  if (candUl) candUl.innerHTML = "";
  if (pledgeUl) pledgeUl.innerHTML = "";

  const bmCandidates = myBookmarks.filter((b) => b.target_type === "candidate");
  const bmPledges = myBookmarks.filter((b) => b.target_type === "pledge");

  if (candUl && pledgeUl) {
    if (!state.user) {
      candUl.innerHTML = `<li class="subtitle">로그인 후 확인 가능합니다.</li>`;
      pledgeUl.innerHTML = `<li class="subtitle">로그인 후 확인 가능합니다.</li>`;
    } else {
      if (!bmCandidates.length) candUl.innerHTML = `<li class="subtitle">관심 후보가 없습니다.</li>`;
      if (!bmPledges.length) pledgeUl.innerHTML = `<li class="subtitle">관심 공약이 없습니다.</li>`;

      bmCandidates.forEach((b) => {
        const c = getCandidateById(b.target_id);
        const title = c ? `${c.name} (${c.party || "무소속"})` : `후보(${String(b.target_id).slice(0, 8)}…)`;
        const li = document.createElement("li");
        li.innerHTML = `<span class="mypage__item-title">${title}</span><button class="btn ghost tiny" data-unbookmark="candidate:${b.target_id}">삭제</button>`;
        candUl.appendChild(li);
      });

      bmPledges.forEach((b) => {
        const p = getPledgeById(b.target_id);
        const title = p ? p.title : `공약(${String(b.target_id).slice(0, 8)}…)`;
        const li = document.createElement("li");
        li.innerHTML = `<span class="mypage__item-title">${title}</span><button class="btn ghost tiny" data-unbookmark="pledge:${b.target_id}">삭제</button>`;
        pledgeUl.appendChild(li);
      });
    }
  }

  // 내 글/댓글
  const myPostsUl = qs("#myPosts");
  const myCommentsUl = qs("#myComments");
  if (myPostsUl) myPostsUl.innerHTML = "";
  if (myCommentsUl) myCommentsUl.innerHTML = "";

  if (myPostsUl && myCommentsUl) {
    if (!state.user) {
      myPostsUl.innerHTML = `<li class="subtitle">로그인 후 확인 가능합니다.</li>`;
      myCommentsUl.innerHTML = `<li class="subtitle">로그인 후 확인 가능합니다.</li>`;
    } else {
      if (!myPosts.length) myPostsUl.innerHTML = `<li class="subtitle">작성한 글이 없습니다.</li>`;
      if (!myComments.length) myCommentsUl.innerHTML = `<li class="subtitle">작성한 댓글이 없습니다.</li>`;

      myPosts.forEach((p) => {
        const lines = (p.content || "").split("\n");
        const title = lines[0] || "(제목 없음)";
        const date = (p.created_at || "").slice(0, 10);
        const li = document.createElement("li");
        li.innerHTML = `<span class="mypage__item-title">${title}</span><span class="mypage__item-meta">${date}</span>`;
        myPostsUl.appendChild(li);
      });

      myComments.forEach((c) => {
        const date = (c.created_at || "").slice(0, 10);
        const li = document.createElement("li");
        li.innerHTML = `<span class="mypage__item-title">${c.content.slice(0, 40)}</span><span class="mypage__item-meta">${date}</span>`;
        myCommentsUl.appendChild(li);
      });
    }
  }
}

// 커뮤니티 게시글 렌더
function renderPosts() {
  const container = qs("#postList");
  container.innerHTML = "";

  const filteredPosts = posts.filter((p) => {
    const candOk = state.community.candidate_id ? p.candidate_id === state.community.candidate_id : true;
    const pledgeOk = state.community.pledge_id ? p.pledge_id === state.community.pledge_id : true;
    return candOk && pledgeOk;
  });

  if (!filteredPosts.length) {
    const empty = document.createElement("p");
    empty.className = "subtitle";
    empty.textContent = state.community.candidate_id || state.community.pledge_id ? "필터 조건에 맞는 게시글이 없습니다." : "아직 작성된 게시글이 없습니다. 첫 글을 남겨보세요.";
    container.appendChild(empty);
    return;
  }

  filteredPosts.forEach((p) => {
    const div = document.createElement("div");
    div.className = "card post";

    const lines = (p.content || "").split("\n");
    const title = lines[0] || "(제목 없음)";
    const bodyPreview = lines.slice(1).join(" ").slice(0, 120);
    const createdAt = (p.created_at || "").slice(0, 10);
    const author = p.user_id ? `${String(p.user_id).slice(0, 8)}…` : "익명";

    const comments = commentsByPost[p.id] || [];

    const candTag = p.candidate_id ? getCandidateNameById(p.candidate_id) : null;
    const pledgeTag = p.pledge_id ? getPledgeById(p.pledge_id)?.title : null;
    const tagHtml = [candTag ? `<span class="pill info">후보 · ${candTag}</span>` : "", pledgeTag ? `<span class="pill neutral">공약 · ${pledgeTag}</span>` : ""]
      .filter(Boolean)
      .join(" ");

    const canEdit = state.user && p.user_id === state.user.id;
    const canDelete = state.user && (p.user_id === state.user.id || (userProfile && userProfile.role === 'admin'));

    div.innerHTML = `
      <div class="post__header">
        <div>
          <h4 style="margin:0;">${title}</h4>
          <div class="post__meta">${author} · ${createdAt} · 댓글 ${comments.length}</div>
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <span class="pill neutral">토론</span>
          ${canEdit ? `<button class="btn ghost tiny" data-edit-post="${p.id}">수정</button>` : ""}
          ${canDelete ? `<button class="btn danger tiny" data-delete-post="${p.id}">삭제</button>` : ""}
        </div>
      </div>
      <div class="pill-row">${tagHtml}</div>
      <p class="subtitle">${bodyPreview || ""}</p>
      <div class="comments" data-post-id="${p.id}">
        <ul class="comment-list">
          ${comments
            .map((c) => {
              const cDate = (c.created_at || "").slice(0, 10);
              const canDeleteComment = state.user && (c.user_id === state.user.id || (userProfile && userProfile.role === 'admin'));
              return `<li><span class="comment-content">${c.content}</span><span class="comment-meta">${cDate}</span>${canDeleteComment ? `<button class="btn ghost tiny" data-delete-comment="${c.id}">삭제</button>` : ''}</li>`;
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

// 테마주 카드 렌더
function renderThemes() {
  const container = qs("#themeList");
  container.innerHTML = "";
  themeStocks.forEach((t) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h4 style="margin:0 0 6px;">${t.name}</h4>
      <p class="subtitle">${t.note}</p>
      <div class="pill-row">
        ${t.symbols.map((s) => `<span class="pill neutral">${s}</span>`).join("")}
      </div>
    `;
    container.appendChild(card);
  });
}

// 로그인/회원가입 모달 열기
function openAuthModal(mode = "login") {
  state.mode = mode;
  qs("#modalTitle").textContent = mode === "login" ? "로그인" : "회원가입";
  qs("#authModal").classList.add("show");
  qs("#authModal").setAttribute("aria-hidden", "false");
  // Remember me: prefills
  const remembered = localStorage.getItem('rememberEmail');
  if (remembered) {
    const emailInput = qs('#authEmail');
    const rememberCheckbox = qs('#rememberMe');
    if (emailInput) emailInput.value = remembered;
    if (rememberCheckbox) rememberCheckbox.checked = true;
  }
  // show nickname only for signup
  const nickContainer = qs('#authNicknameContainer');
  const nickInput = qs('#authNickname');
  if (nickContainer) nickContainer.style.display = (mode === 'signup') ? 'block' : 'none';
  if (nickInput) {
    if (mode === 'signup') {
      nickInput.required = true;
    } else {
      nickInput.required = false;
      nickInput.value = '';
    }
  }
}

// 인증 모달 닫기
function closeAuthModal() {
  qs("#authModal").classList.remove("show");
  qs("#authModal").setAttribute("aria-hidden", "true");
}

// 후보 추가 모달 열기
function openCandidateModal() {
  qs("#candidateModal").classList.add("show");
  qs("#candidateModal").setAttribute("aria-hidden", "false");
}

// 후보 추가 모달 닫기
function closeCandidateModal() {
  qs("#candidateModal").classList.remove("show");
  qs("#candidateModal").setAttribute("aria-hidden", "true");
  // 폼 초기화
  qs("#candidateForm").reset();
}

// 공약 추가 모달 열기
function openPledgeModal() {
  renderPledgeCandidateOptions();
  loadFulfillmentSources().then(() => {
    renderSourceOptions();
    toggleNewSourceFields();
  });
  qs("#pledgeModal").classList.add("show");
  qs("#pledgeModal").setAttribute("aria-hidden", "false");
}

// 공약 추가 모달 닫기
function closePledgeModal() {
  qs("#pledgeModal").classList.remove("show");
  qs("#pledgeModal").setAttribute("aria-hidden", "true");
  qs("#pledgeForm").reset();
  toggleNewSourceFields();
}

// 공약 추가 폼 제출 처리
async function handlePledgeSubmit(e) {
  e.preventDefault();

  const candidate_id = qs("#pledgeCandidateSelect").value;
  const title = qs("#pledgeTitle").value.trim();
  const category = qs("#pledgeCategory").value.trim() || null;
  const description = qs("#pledgeDescription").value.trim() || null;
  const fulfillment_rate_raw = qs("#pledgeRate").value.trim();
  const fulfillment_rate = fulfillment_rate_raw === "" ? null : parseInt(fulfillment_rate_raw, 10);
  const status = qs("#pledgeStatus").value || null;
  const sourceSelection = qs("#pledgeSourceSelect").value || null;

  if (!candidate_id || !title) {
    alert("후보자와 공약 제목을 입력하세요.");
    return;
  }

  if (fulfillment_rate !== null && (isNaN(fulfillment_rate) || fulfillment_rate < 0 || fulfillment_rate > 100)) {
    alert("이행률은 0~100 사이의 숫자여야 합니다.");
    return;
  }

  // 증빙 입력
  const evidence = {
    type: qs("#evidenceType").value || null,
    source_url: qs("#evidenceUrl").value.trim() || null,
    description: qs("#evidenceDescription").value.trim() || null,
  };

  try {
    // source_id 처리 (기존 선택 또는 신규 생성)
    let source_id = null;
    if (sourceSelection && sourceSelection !== "__new__") {
      source_id = sourceSelection;
    } else if (sourceSelection === "__new__") {
      const newName = qs("#newSourceName").value.trim();
      const newDesc = qs("#newSourceDescription").value.trim() || null;
      if (!newName) {
        alert("출처 이름을 입력하세요.");
        return;
      }
      const { data: sData, error: sErr } = await supabaseClient
        .from("fulfillment_sources")
        .insert([{ name: newName, description: newDesc }])
        .select()
        .single();
      if (sErr) throw sErr;
      source_id = sData.id;
      // 로컬 목록 갱신
      await loadFulfillmentSources();
      renderSourceOptions();
      qs("#pledgeSourceSelect").value = source_id;
      toggleNewSourceFields();
    }

    await createPledge(
      {
        candidate_id,
        title,
        category,
        description,
        fulfillment_rate,
        status,
        source_id,
      },
      evidence
    );

    const isPending = !isAdmin();
    alert(
      isPending
        ? "공약이 등록되었습니다. 관리자 승인 후 공개됩니다."
        : "공약이 추가되었습니다!"
    );
    closePledgeModal();
    // 데이터 재정렬 후 렌더
    renderHighlight();
    renderCandidates();
    initStats();
  } catch (err) {
    console.error("[createPledge error]", err);
    const msg = err?.message ?? "공약 추가에 실패했습니다.";
    alert(`오류: ${msg}`);
  }
}

// 후보 추가 폼 제출 처리
async function handleCandidateSubmit(e) {
  e.preventDefault();

  const name = qs("#candidateName").value.trim();
  const party = qs("#candidateParty").value.trim() || null;
  const position = qs("#candidatePosition").value.trim();
  const election_year = parseInt(qs("#candidateElectionYear").value.trim());
  const region = qs("#candidateRegion").value.trim() || null;
  const photo_url = qs("#candidatePhotoUrl").value.trim() || null;
  const description = qs("#candidateDescription").value.trim() || null;

  // 필수 필드 검증
  if (!name || !position || !election_year) {
    alert("이름, 직책, 선거 연도는 필수 입력 항목입니다.");
    return;
  }

  if (isNaN(election_year) || election_year < 2000 || election_year > 2100) {
    alert("선거 연도는 2000~2100 사이의 숫자여야 합니다.");
    return;
  }

  try {
    // Supabase에 후보 추가
    await createCandidate({
      name,
      party,
      position,
      election_year,
      region,
      photo_url,
      description,
    });

    const isPending = !isAdmin();
    alert(
      isPending
        ? `${name} 후보가 등록되었습니다. 관리자 승인 후 공개됩니다.`
        : `${name} 후보가 성공적으로 추가되었습니다!`
    );
    closeCandidateModal();
  } catch (err) {
    console.error("[createCandidate error]", err);
    const msg = err?.message ?? "후보 추가에 실패했습니다.";
    alert(`오류: ${msg}`);
  }
}

// 간단 인증 처리 (데모: 실제 저장 없음)
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
    // state.mode 값에 따라 로그인/회원가입 처리
    if (state.mode === "signup") {
      const nickname = qs('#authNickname') ? qs('#authNickname').value.trim() : '';
      if (!nickname) {
        alert('닉네임을 입력하세요. (회원가입 시 필수)');
        return;
      }
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      console.log("[signup] response", data);
      // Try to create a user_profiles row with the nickname if the new user id is available.
      const newUserId = data?.user?.id || data?.id || data?.userId || null;
      if (newUserId && nickname) {
        try {
          const { error: upErr } = await supabaseClient.from('user_profiles').insert([
            { user_id: newUserId, nickname, role: 'user', status: 'active', reputation_score: 0 }
          ]);
          if (upErr) console.warn('[signup] user_profiles insert failed', upErr);
        } catch (e) {
          console.warn('[signup] user_profiles insert exception', e);
        }
      }
      alert("회원가입 요청 완료! 이메일 인증이 필요할 수 있어요.");
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      console.log("[login] response", data);
    }

    // 세션/유저 반영은 onAuthStateChange에서 처리됨
    // remember me
    const remember = qs('#rememberMe') && qs('#rememberMe').checked;
    if (remember) localStorage.setItem('rememberEmail', email);
    else localStorage.removeItem('rememberEmail');

    closeAuthModal();
  } catch (err) {
    console.error("[auth error]", err);
    const msg = err?.message ?? "인증에 실패했습니다.";
    alert(`오류: ${msg}`);
  }
}

// 이벤트 바인딩 (검색, 필터, 인증, 커뮤니티 작성)
function bindEvents() {
  const _searchInput = qs("#searchInput");
  if (_searchInput) _searchInput.addEventListener("input", (e) => {
    state.search = e.target.value;
    renderCandidates();
  });
  const _statusFilter = qs("#statusFilter");
  if (_statusFilter) _statusFilter.addEventListener("change", (e) => {
    state.filter = e.target.value;
    renderCandidates();
  });
  const _loginBtn = qs("#loginBtn");
  if (_loginBtn) _loginBtn.addEventListener("click", async () => {
    // 로그인 상태면 "로그아웃" 동작
    if (state.user) {
      await supabaseClient.auth.signOut();
      return;
    }
    openAuthModal("login");
  });
  const _signupBtn = qs("#signupBtn");
  if (_signupBtn) _signupBtn.addEventListener("click", () => openAuthModal("signup"));
  // 마이페이지 버튼이 있는 경우에만 이벤트 리스너 추가
  const openMypageBtn = qs("#openMypageBtn");
  if (openMypageBtn) {
    openMypageBtn.addEventListener("click", () => {
      if (!state.user) {
        openAuthModal("login");
        return;
      }
      window.open("mypage.html", "_blank");
    });
  }
  const _closeModal = qs("#closeModal");
  if (_closeModal) _closeModal.addEventListener("click", closeAuthModal);
  const _authSubmit = qs("#authSubmit");
  if (_authSubmit) _authSubmit.addEventListener("click", handleAuth);

  // Enter 키로 로그인 제출
  const authEmailInput = qs('#authEmail');
  const authPasswordInput = qs('#authPassword');
  [authEmailInput, authPasswordInput].forEach(el => {
    if (!el) return;
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        handleAuth();
      }
    });
  });

  // 소셜 로그인 버튼
  const socialKakao = qs('#socialKakao');
  const socialFacebook = qs('#socialFacebook');
  if (socialKakao) socialKakao.addEventListener('click', () => supabaseClient.auth.signInWithOAuth({ provider: 'kakao' }).catch(e=>{console.warn(e); alert('소셜 로그인 실패');}));
  if (socialFacebook) socialFacebook.addEventListener('click', () => supabaseClient.auth.signInWithOAuth({ provider: 'facebook' }).catch(e=>{console.warn(e); alert('소셜 로그인 실패');}));

  // 공약 출처 셀렉트 변경 시 신규 입력 필드 토글
  const _pledgeSourceSelect = qs("#pledgeSourceSelect");
  if (_pledgeSourceSelect) _pledgeSourceSelect.addEventListener("change", toggleNewSourceFields);

  // 커뮤니티 게시글 작성 처리
  const _postSubmit = qs("#postSubmit");
  if (_postSubmit) _postSubmit.addEventListener("click", async () => {
    const title = qs("#postTitle").value.trim();
    const contentBody = qs("#postContent").value.trim();

    if (!title || !contentBody) {
      alert("제목과 내용을 입력하세요.");
      return;
    }

    if (!state.user) {
      alert("게시글 작성을 위해 로그인이 필요합니다.");
      openAuthModal("login");
      return;
    }

    const candidate_id = qs("#postCandidateSelect")?.value || null;
    const pledge_id = qs("#postPledgeSelect")?.value || null;
    const finalContent = `${title}\n\n${contentBody}`;

    try {
      // 파일 업로드 처리
      const fileInput = qs('#postFile');
      let fileUrl = null;
      if (fileInput && fileInput.files && fileInput.files[0]) {
        fileUrl = await uploadFileToStorage(fileInput.files[0]);
      }

      const contentPayload = fileUrl ? { text: finalContent, file_url: fileUrl } : finalContent;

      await createPost({ content: contentPayload, candidate_id: candidate_id || null, pledge_id: pledge_id || null });
      qs("#postTitle").value = "";
      qs("#postContent").value = "";
      if (fileInput) { fileInput.value = ''; const prev = qs('#postFilePreview'); if (prev) prev.innerHTML = ''; }
    } catch (err) {
      console.error("[createPost error]", err);
      const msg = err?.message ?? "게시글 작성에 실패했습니다.";
      alert(`오류: ${msg}`);
    }
  });

  // 파일 선택 미리보기
  const postFileInput = qs('#postFile');
  if (postFileInput) {
    postFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      const prev = qs('#postFilePreview');
      if (!prev) return;
      if (!file) { prev.innerHTML = ''; return; }
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => { prev.innerHTML = `<img src="${reader.result}" style="max-width:100%; max-height:120px; object-fit:cover; border-radius:8px;"/>`; };
        reader.readAsDataURL(file);
      } else {
        prev.innerHTML = `<div class="caption">선택된 파일: ${file.name}</div>`;
      }
    });
  }

  // 커뮤니티 필터
  const _communityFilterCandidate = qs("#communityFilterCandidate");
  if (_communityFilterCandidate) _communityFilterCandidate.addEventListener("change", (e) => {
    state.community.candidate_id = e.target.value || null;
    // 후보 필터가 바뀌면 공약 필터는 유지하되, 후보가 달라 불일치할 수 있어 자동 해제
    if (state.community.pledge_id) {
      const pledge = getPledgeById(state.community.pledge_id);
      const belongs = pledge && getCandidateById(state.community.candidate_id)?.promises?.some((p) => p.id === state.community.pledge_id);
      if (state.community.candidate_id && !belongs) {
        state.community.pledge_id = null;
        qs("#communityFilterPledge").value = "";
      }
    }
    renderPosts();
  });
  const _communityFilterPledge = qs("#communityFilterPledge");
  if (_communityFilterPledge) _communityFilterPledge.addEventListener("change", (e) => {
    state.community.pledge_id = e.target.value || null;
    renderPosts();
  });
  const _clearCommunityFilter = qs("#clearCommunityFilter");
  if (_clearCommunityFilter) _clearCommunityFilter.addEventListener("click", () => {
    state.community.candidate_id = null;
    state.community.pledge_id = null;
    qs("#communityFilterCandidate").value = "";
    qs("#communityFilterPledge").value = "";
    renderPosts();
  });

  // 커뮤니티 댓글 작성 (이벤트 위임)
  const _postList = qs("#postList");
  if (_postList) _postList.addEventListener("click", async (e) => {
    // 댓글 작성
    const postId = e.target.getAttribute("data-comment-submit");
    if (postId) {
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
      } catch (err) {
        console.error("[createComment error]", err);
        const msg = err?.message ?? "댓글 작성에 실패했습니다.";
        alert(`오류: ${msg}`);
      }
      return;
    }

    // 게시글 편집/삭제
    const editPostId = e.target.getAttribute("data-edit-post");
    if (editPostId) {
      const postCard = e.target.closest('.card.post');
      if (!postCard) return;
      // 기존 내용 표시 대신 편집 textarea 삽입
      const contentP = postCard.querySelector('.subtitle');
      const currentContent = (posts.find(p=>p.id===editPostId)?.content) || '';
      const editor = document.createElement('div');
      editor.innerHTML = `<textarea rows="4" class="edit-post-textarea">${currentContent}</textarea><div style="display:flex; gap:8px; margin-top:8px;"><button class="btn primary" data-save-post="${editPostId}">저장</button><button class="btn ghost" data-cancel-edit-post="${editPostId}">취소</button></div>`;
      if (contentP) contentP.replaceWith(editor);
      return;
    }

    const deletePostId = e.target.getAttribute("data-delete-post");
    if (deletePostId) {
      if (!confirm('정말로 게시글을 삭제하시겠습니까?')) return;
      try {
        await deletePost(deletePostId);
        alert('게시글이 삭제되었습니다.');
      } catch (err) {
        console.error('[deletePost error]', err);
        alert(`오류: ${err?.message ?? '삭제 실패'}`);
      }
      return;
    }

    // 댓글 삭제
    const deleteCommentId = e.target.getAttribute('data-delete-comment');
    if (deleteCommentId) {
      if (!confirm('댓글을 삭제하시겠습니까?')) return;
      try {
        const { error } = await supabaseClient.from('comments').delete().eq('id', deleteCommentId);
        if (error) throw error;
        // 로컬 반영
        for (const key of Object.keys(commentsByPost)) {
          commentsByPost[key] = (commentsByPost[key] || []).filter(c => String(c.id) !== String(deleteCommentId));
        }
        renderPosts();
      } catch (err) {
        console.error('[deleteComment error]', err);
        alert(`오류: ${err?.message ?? '댓글 삭제 실패'}`);
      }
      return;
    }

    // 저장/취소 핸들러
    const savePostId = e.target.getAttribute('data-save-post');
    if (savePostId) {
      const textarea = e.target.closest('.card.post').querySelector('.edit-post-textarea');
      if (!textarea) return;
      const newContent = textarea.value.trim();
      if (!newContent) return alert('내용을 입력하세요.');
      try {
        await updatePost(savePostId, newContent);
        alert('수정되었습니다.');
      } catch (err) {
        console.error('[updatePost error]', err);
        alert(`오류: ${err?.message ?? '수정 실패'}`);
      }
      return;
    }

    const cancelEditId = e.target.getAttribute('data-cancel-edit-post');
    if (cancelEditId) {
      // 재렌더로 원상 복구
      renderPosts();
      return;
    }
  });

  // Close modal on backdrop click
  const _authModalBackdrop = qs("#authModal");
  if (_authModalBackdrop) _authModalBackdrop.addEventListener("click", (e) => {
    if (e.target.id === "authModal") closeAuthModal();
  });

  // Enter + Space 를 줄바꿈으로 처리 (post content)
  const postContentEl = qs('#postContent');
  if (postContentEl) {
    let lastWasEnter = false;
    postContentEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        // prevent default newline; wait for space
        ev.preventDefault();
        lastWasEnter = true;
        setTimeout(() => (lastWasEnter = false), 800);
        return;
      }
      if (ev.key === ' ' && lastWasEnter) {
        // insert newline at cursor
        const el = ev.target;
        const start = el.selectionStart; const end = el.selectionEnd;
        const value = el.value;
        el.value = value.slice(0, start) + '\n' + value.slice(end);
        el.selectionStart = el.selectionEnd = start + 1;
        lastWasEnter = false;
        ev.preventDefault();
      }
    });
  }

  // 후보 추가 관련 이벤트
  const _addCandidateBtn = qs("#addCandidateBtn");
  if (_addCandidateBtn) _addCandidateBtn.addEventListener("click", openCandidateModal);
  const _closeCandidateModalBtn = qs("#closeCandidateModal");
  if (_closeCandidateModalBtn) _closeCandidateModalBtn.addEventListener("click", closeCandidateModal);
  const _cancelCandidateBtn = qs("#cancelCandidateBtn");
  if (_cancelCandidateBtn) _cancelCandidateBtn.addEventListener("click", closeCandidateModal);
  const _candidateForm = qs("#candidateForm");
  if (_candidateForm) _candidateForm.addEventListener("submit", handleCandidateSubmit);

  // 후보 모달 배경 클릭 시 닫기
  const _candidateModal = qs("#candidateModal");
  if (_candidateModal) _candidateModal.addEventListener("click", (e) => {
    if (e.target.id === "candidateModal") closeCandidateModal();
  });

  // 공약 추가 관련 이벤트
  const _addPledgeBtn = qs("#addPledgeBtn");
  if (_addPledgeBtn) _addPledgeBtn.addEventListener("click", openPledgeModal);
  const _closePledgeModalBtn = qs("#closePledgeModal");
  if (_closePledgeModalBtn) _closePledgeModalBtn.addEventListener("click", closePledgeModal);
  const _cancelPledgeBtn = qs("#cancelPledgeBtn");
  if (_cancelPledgeBtn) _cancelPledgeBtn.addEventListener("click", closePledgeModal);
  const _pledgeForm = qs("#pledgeForm");
  if (_pledgeForm) _pledgeForm.addEventListener("submit", handlePledgeSubmit);
  const _pledgeModal = qs("#pledgeModal");
  if (_pledgeModal) _pledgeModal.addEventListener("click", (e) => {
    if (e.target.id === "pledgeModal") closePledgeModal();
  });

  // 후보/공약 토론 및 증빙 버튼 (후보 카드 영역에서 위임)
  const _candidateList = qs("#candidateList");
  if (_candidateList) _candidateList.addEventListener("click", async (e) => {
    // 카드 클릭 이동: 버튼/링크 클릭은 제외
    const clickedButtonOrLink = e.target.closest("button") || e.target.closest("a");
    if (!clickedButtonOrLink) {
      const cardEl = e.target.closest(".candidate-clickable");
      if (cardEl) {
        const id = cardEl.getAttribute("data-candidate-id");
        const name = cardEl.getAttribute("data-candidate-name");
        if (id) {
          window.location.href = `candidate.html?id=${encodeURIComponent(id)}`;
          return;
        }
        if (name) {
          window.location.href = `candidate.html?name=${encodeURIComponent(name)}`;
          return;
        }
      }
    }

    const candId = e.target.getAttribute("data-community-candidate");
    const pledgeId = e.target.getAttribute("data-community-pledge");
    const evidencePledgeId = e.target.getAttribute("data-evidence-pledge");
    const bookmarkCandidateId = e.target.getAttribute("data-bookmark-candidate");
    const bookmarkPledgeId = e.target.getAttribute("data-bookmark-pledge");

    if (candId) {
      state.community.candidate_id = candId;
      state.community.pledge_id = null;
      qs("#communityFilterCandidate").value = candId;
      qs("#communityFilterPledge").value = "";
      renderPosts();
      document.querySelector("#community")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (pledgeId) {
      state.community.pledge_id = pledgeId;
      // 후보도 함께 맞춰줌(가능하면)
      for (const c of candidates) {
        if ((c.promises || []).some((p) => p.id === pledgeId)) {
          state.community.candidate_id = c.id;
          qs("#communityFilterCandidate").value = c.id;
          break;
        }
      }
      qs("#communityFilterPledge").value = pledgeId;
      renderPosts();
      document.querySelector("#community")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    if (evidencePledgeId) {
      openEvidenceModal(evidencePledgeId);
      await renderEvidenceModal(evidencePledgeId);
      return;
    }

    if (bookmarkCandidateId) {
      await toggleBookmark("candidate", bookmarkCandidateId);
      return;
    }

    if (bookmarkPledgeId) {
      await toggleBookmark("pledge", bookmarkPledgeId);
      return;
    }

    // 관리자 액션
    const approveCand = e.target.getAttribute("data-admin-approve-candidate");
    const rejectCand = e.target.getAttribute("data-admin-reject-candidate");
    const deleteCand = e.target.getAttribute("data-admin-delete-candidate");
    const approvePledge = e.target.getAttribute("data-admin-approve-pledge");
    const rejectPledge = e.target.getAttribute("data-admin-reject-pledge");
    const deletePledge = e.target.getAttribute("data-admin-delete-pledge");

    try {
      if (approveCand) {
        await adminUpdateCandidateStatus(approveCand, "approve");
        alert("후보가 승인되었습니다.");
        return;
      }
      if (rejectCand) {
        await adminUpdateCandidateStatus(rejectCand, "reject");
        alert("후보가 반려되었습니다.");
        return;
      }
      if (deleteCand) {
        const deleted = await adminDeleteCandidate(deleteCand);
        if (deleted) alert("후보가 삭제되었습니다.");
        return;
      }
      if (approvePledge) {
        await adminUpdatePledgeStatus(approvePledge, "approve");
        alert("공약이 승인되었습니다.");
        return;
      }
      if (rejectPledge) {
        await adminUpdatePledgeStatus(rejectPledge, "reject");
        alert("공약이 반려되었습니다.");
        return;
      }
      if (deletePledge) {
        const deleted = await adminDeletePledge(deletePledge);
        if (deleted) alert("공약이 삭제되었습니다.");
        return;
      }
    } catch (err) {
      console.error("[admin action error]", err);
      alert(`관리자 작업 실패: ${err?.message ?? "오류"}`);
    }
  });

  // 증빙 모달 이벤트
  const _closeEvidenceModal = qs("#closeEvidenceModal");
  if (_closeEvidenceModal) _closeEvidenceModal.addEventListener("click", closeEvidenceModal);
  const _cancelEvidenceBtn = qs("#cancelEvidenceBtn");
  if (_cancelEvidenceBtn) _cancelEvidenceBtn.addEventListener("click", closeEvidenceModal);
  const _evidenceModal = qs("#evidenceModal");
  if (_evidenceModal) _evidenceModal.addEventListener("click", (e) => {
    if (e.target.id === "evidenceModal") closeEvidenceModal();
  });
  const _evidenceForm = qs("#evidenceForm");
  if (_evidenceForm) _evidenceForm.addEventListener("submit", handleEvidenceSubmit);

  // 마이페이지 이벤트 - (refresh button removed)
  // 닉네임 저장은 user_profiles에 nickname 컬럼 추가 후 활성화 가능
  const saveNicknameBtn = qs("#saveNicknameBtn");
  if (saveNicknameBtn) {
    saveNicknameBtn.addEventListener("click", async () => {
      // Save nickname to user_profiles.nickname (defensive)
      if (!state.user) return alert('로그인이 필요합니다.');
      const nickInput = qs('#mypageNickname');
      if (!nickInput) return;
      const nickname = nickInput.value.trim();
      if (!nickname) return alert('닉네임을 입력하세요.');
      try {
        // Try update existing profile row
        const { data, error } = await supabaseClient.from('user_profiles').update({ nickname }).eq('user_id', state.user.id).select().maybeSingle();
        if (error) {
          // If column doesn't exist or update failed, try insert or show message
          const msg = error?.message || '';
          console.warn('[saveNickname] update error', error);
          // show a helpful alert with Supabase error details for debugging
          try {
            alert(`닉네임 저장 실패(업데이트): ${msg}\n\n(콘솔에 상세 정보가 있습니다)`);
            console.error('[saveNickname update error details]', error);
          } catch (e) {}
          if (/column .*nickname.* does not exist/i.test(msg)) {
            return alert('서버쪽 user_profiles에 nickname 컬럼이 존재하지 않아 저장할 수 없습니다. 관리자에게 문의하세요.');
          }
          // Try insert fallback (if no profile row exists)
          try {
            const { data: ins, error: insErr } = await supabaseClient.from('user_profiles').insert([{ user_id: state.user.id, nickname, role: 'user', status: 'active', reputation_score: 0 }]).select().maybeSingle();
            if (insErr) throw insErr;
            userProfile = ins || userProfile;
          } catch (ie) {
            console.error('[saveNickname] insert fallback failed', ie);
            return alert(`닉네임 저장 실패: ${ie?.message ?? ie}`);
          }
        } else {
          // success: refresh local profile
          userProfile = data || userProfile;
        }

        alert('닉네임이 저장되었습니다.');
        // Disable editing UI and restore buttons
        if (nickInput) {
          // remove input listener if attached
          if (nickInput._nickInputHandler) {
            nickInput.removeEventListener('input', nickInput._nickInputHandler);
            delete nickInput._nickInputHandler;
          }
          nickInput.disabled = true;
        }
        if (saveNicknameBtn) {
          saveNicknameBtn.disabled = true;
          saveNicknameBtn.style.display = 'none';
        }
        const editBtn = qs('#editNicknameBtn'); if (editBtn) { editBtn.disabled = false; editBtn.style.display = 'inline-block'; }
        // update original value
        mypageOriginalNickname = nickInput ? (nickInput.value || '').trim() : mypageOriginalNickname;
        await refreshMypageData();
      } catch (err) {
        console.error('[saveNickname error]', err);
        const msg = err?.message || err;
        alert(`닉네임 저장 중 오류가 발생했습니다: ${msg}`);
      }
    });
  }

  // Edit nickname button enables the input and focuses it
  const editNicknameBtn = qs('#editNicknameBtn');
  if (editNicknameBtn) {
    editNicknameBtn.addEventListener('click', () => {
      const nickInput = qs('#mypageNickname');
      const saveBtn = qs('#saveNicknameBtn');
      if (!nickInput || !saveBtn) return;
      // show save, hide edit
      editNicknameBtn.style.display = 'none';
      saveBtn.style.display = 'inline-block';
      // enable input and focus
      nickInput.disabled = false;
      nickInput.focus();
      // remember original value and disable save until changed
      mypageOriginalNickname = (nickInput.value || '').trim();
      saveBtn.disabled = true;

      // input listener to enable save when changed
      const onNickInput = (e) => {
        const v = (e.target.value || '').trim();
        saveBtn.disabled = v === mypageOriginalNickname;
      };
      nickInput._nickInputHandler = onNickInput;
      nickInput.addEventListener('input', onNickInput);
    });
  }

  // 마이페이지에서 북마크 삭제 (이벤트 위임) - 마이페이지 섹션이 있는 경우에만
  const mypageEl = qs("#mypage");
  if (mypageEl) {
    mypageEl.addEventListener("click", async (e) => {
      const key = e.target.getAttribute("data-unbookmark");
      if (!key) return;
      const [type, id] = key.split(":");
      await toggleBookmark(type, id);
    });
  }
}

function initStats() {
  qs("#statCandidates").textContent = candidates.length;
  qs("#statPromises").textContent = candidates.reduce(
    (sum, c) => sum + (Array.isArray(c.promises) ? c.promises.length : 0),
    0
  );
}

// 로그인 상태에 따라 상단 버튼/마이페이지 텍스트를 업데이트
function updateAuthUI() {
  const loginBtn = qs("#loginBtn");
  const signupBtn = qs("#signupBtn");

  if (loginBtn) {
    if (state.user) loginBtn.textContent = "로그아웃";
    else loginBtn.textContent = "로그인";
  }
  if (signupBtn) {
    if (state.user) signupBtn.style.display = "none";
    else signupBtn.style.display = "";
  }

  renderMypage();
  renderCandidates(); // 관리자 버튼/배지 반영
}

// Supabase 세션을 읽고, 로그인 상태 변경을 구독
async function initAuth() {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  state.user = session?.user ?? null;
  await refreshMypageData();
  // 관리자/기여자 권한이 반영된 상태로 후보/공약을 다시 불러와야 반려/대기 항목이 보임
  await loadCandidatesFromSupabase();
  updateAuthUI();
  renderCandidates();

  supabaseClient.auth.onAuthStateChange((_event, session2) => {
    state.user = session2?.user ?? null;
    refreshMypageData().then(async () => {
      await loadCandidatesFromSupabase();
      updateAuthUI();
      renderCandidates();
    });
  });
}

async function init() {
  // (테마 설정 UI 제거됨)
  // 1) Supabase에서 candidates 불러오기 (실패/빈 결과면 fallback 사용)
  try {
    await loadCandidatesFromSupabase();
  } catch (e) {
    console.warn('[init] loadCandidatesFromSupabase failed', e);
  }

  // 2) 커뮤니티 데이터 로드
  try {
    await loadCommunity();
  } catch (e) {
    console.warn('[init] loadCommunity failed', e);
  }

  // 3) 출처 로드(공약 모달용)
  try {
    await loadFulfillmentSources();
  } catch (e) {
    console.warn('[init] loadFulfillmentSources failed', e);
  }

  // 4) UI 렌더 (가능한 부분만 시도)
  try { renderPledgeCandidateOptions(); } catch (e) { console.warn('[init] renderPledgeCandidateOptions', e); }
  try { renderCommunityTargetOptions(); } catch (e) { console.warn('[init] renderCommunityTargetOptions', e); }
  try { renderSourceOptions(); } catch (e) { console.warn('[init] renderSourceOptions', e); }
  try { renderHighlight(); } catch (e) { console.warn('[init] renderHighlight', e); }
  try { renderCandidates(); } catch (e) { console.warn('[init] renderCandidates', e); }
  try { renderPosts(); } catch (e) { console.warn('[init] renderPosts', e); }
  try { initStats(); } catch (e) { console.warn('[init] initStats', e); }
  // 실제 회원수 로드
  try { await loadUserCount(); } catch (e) { console.warn('[init] loadUserCount', e); }

  bindEvents();
  // initAuth는 항상 호출해 세션을 읽고 로그인 상태를 반영하게 함
  try { initAuth(); } catch (e) { console.warn('[init] initAuth failed', e); }
}

// Theme settings UI removed

// user_profiles 테이블을 조회하여 실제 회원수를 `#statUsers`에 반영합니다.
// anon 키 / RLS 제약으로 실패할 수 있으므로 여러 방법으로 시도합니다.
async function loadUserCount() {
  const el = qs('#statUsers');
  if (!el) return;
  try {
    // 1) 카운트 헤더 방식 시도
    const { data, error, count } = await supabaseClient.from('user_profiles').select('id', { count: 'exact' });
    if (!error && typeof count === 'number') {
      el.textContent = String(count);
      return;
    }

    // 2) 전체 조회 후 길이 사용 (fallback)
    const { data: all, error: err2 } = await supabaseClient.from('user_profiles').select('id');
    if (!err2 && Array.isArray(all)) {
      el.textContent = String(all.length);
      return;
    }
  } catch (e) {
    console.warn('[loadUserCount] failed', e);
  }

  // 최종 fallback: 비어있거나 조회 불가 시 대시 표시
  el.textContent = '-';
}

document.addEventListener("DOMContentLoaded", () => {
  init();
});
