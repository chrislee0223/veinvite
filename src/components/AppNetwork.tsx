'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { NETWORK_COPY } from '@/lib/i18n/networkCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';

type NetworkMemberStatus = 'IN_PROGRESS' | 'QUALIFIED' | 'REWARDED';
type SortMode = 'network' | 'qualified' | 'growth';
type BranchFilter = 'all' | 'qualified' | 'growth';

type NetworkChild = {
  wallet: string;
  status: NetworkMemberStatus;
  joinedAt: string | null;
  network: number;
  direct: number;
  qualified: number;
  thisRound: number;
  depth: number;
};

type NetworkSearchResult = {
  wallet: string;
  parentWallet: string | null;
  depth: number;
};

type NetworkData = {
  rootWallet: string;
  focusWallet: string;
  focusDepth: number;
  invitedBy: string | null;
  breadcrumb: string[];
  summary: {
    network: number;
    direct: number;
    qualified: number;
    thisRound: number;
    depth: number;
  };
  round: {
    id: number;
    startAt: string;
    endAt: string;
  } | null;
  children: NetworkChild[];
  searchResults: NetworkSearchResult[];
  depthLimitReached: boolean;
};

type NetworkText = {
  myNetwork: string;
  network: string;
  direct: string;
  qualified: string;
  thisRound: string;
  directNetwork: string;
  invitedBy: string;
  backToMine: string;
  searchPlaceholder: string;
  searchHint: string;
  searchResults: string;
  noSearchResults: string;
  sortBy: string;
  sortNetwork: string;
  sortQualified: string;
  sortGrowth: string;
  inProgress: string;
  rewarded: string;
  viewNetwork: string;
  openExplorer: string;
  more: string;
  emptyTitle: string;
  emptyDescription: string;
  inviteFriend: string;
  connectTitle: string;
  connectDescription: string;
  connectWallet: string;
  loadError: string;
  retry: string;
  depthLimit: string;
  generation: string;
  downstream: string;
  growth: string;
  clearFilter: string;
};

const EN_TEXT: NetworkText = {
  myNetwork: 'My Network',
  network: 'Network',
  direct: 'Direct',
  qualified: 'Qualified',
  thisRound: 'This Round',
  directNetwork: 'Direct Network',
  invitedBy: 'Invited by',
  backToMine: 'Back to My Network',
  searchPlaceholder: 'Search wallet in your network',
  searchHint: 'Enter at least 3 characters of a wallet address.',
  searchResults: 'Search results',
  noSearchResults: 'No wallet found in your network.',
  sortBy: 'Sort',
  sortNetwork: 'Network size',
  sortQualified: 'Qualified',
  sortGrowth: 'Recent growth',
  inProgress: 'In Progress',
  rewarded: 'Rewarded',
  viewNetwork: 'View network',
  openExplorer: 'Explorer',
  more: 'more',
  emptyTitle: 'Your network starts here',
  emptyDescription: 'Invite an eligible new or returning user. Once they pass VeInvite entry checks, they will appear here automatically.',
  inviteFriend: 'Invite a friend',
  connectTitle: 'Connect to see your network',
  connectDescription: 'Your VeInvite network is private to your verified wallet session.',
  connectWallet: 'Connect wallet',
  loadError: 'We could not load your network.',
  retry: 'Try again',
  depthLimit: 'This branch has reached the current 100-generation display boundary.',
  generation: 'Generation',
  downstream: 'Downstream',
  growth: 'growth',
  clearFilter: 'Show all',
};

const TEXT_OVERRIDES: Partial<Record<SupportedLocale, Partial<NetworkText>>> = {
  ko: {
    myNetwork: '내 네트워크',
    network: '네트워크',
    direct: '직접 초대',
    qualified: '미션 완료',
    thisRound: '이번 라운드',
    directNetwork: '직접 네트워크',
    invitedBy: '추천인',
    backToMine: '내 네트워크로',
    searchPlaceholder: '내 네트워크에서 지갑 검색',
    searchHint: '지갑 주소를 3자 이상 입력하세요.',
    searchResults: '검색 결과',
    noSearchResults: '내 네트워크에서 일치하는 지갑을 찾지 못했어요.',
    sortBy: '정렬',
    sortNetwork: '네트워크 규모',
    sortQualified: '미션 완료',
    sortGrowth: '최근 성장',
    inProgress: '진행 중',
    rewarded: '보상 완료',
    viewNetwork: '네트워크 보기',
    openExplorer: 'Explorer',
    more: '명 더',
    emptyTitle: '여기서 네트워크가 시작돼요',
    emptyDescription: '자격을 갖춘 신규 또는 복귀 사용자를 초대해 보세요. VeInvite 참여 자격 검증을 통과하면 이곳에 자동으로 표시됩니다.',
    inviteFriend: '친구 초대하기',
    connectTitle: '지갑을 연결해 네트워크를 확인하세요',
    connectDescription: 'VeInvite 네트워크는 검증된 지갑 세션에서만 확인할 수 있어요.',
    connectWallet: '지갑 연결',
    loadError: '네트워크를 불러오지 못했어요.',
    retry: '다시 시도',
    depthLimit: '이 분기는 현재 표시 기준인 100세대에 도달했어요.',
    generation: '세대',
    downstream: '하위 네트워크',
    growth: '증가',
    clearFilter: '전체 보기',
  },
  zh: {
    myNetwork: '我的网络', network: '网络', direct: '直接邀请', qualified: '已完成', thisRound: '本轮', directNetwork: '直接网络', invitedBy: '邀请人', backToMine: '返回我的网络', searchPlaceholder: '在网络中搜索钱包', searchHint: '请输入至少 3 个钱包地址字符。', searchResults: '搜索结果', noSearchResults: '你的网络中没有匹配的钱包。', sortBy: '排序', sortNetwork: '网络规模', sortQualified: '已完成', sortGrowth: '近期增长', inProgress: '进行中', rewarded: '已奖励', viewNetwork: '查看网络', emptyTitle: '你的网络从这里开始', emptyDescription: '邀请符合条件的新用户或回归用户。通过 VeInvite 资格验证后会自动显示在这里。', inviteFriend: '邀请朋友', connectTitle: '连接钱包查看网络', connectDescription: 'VeInvite 网络仅对已验证的钱包会话可见。', connectWallet: '连接钱包', loadError: '无法加载网络。', retry: '重试', generation: '代', downstream: '下级网络', growth: '增长', clearFilter: '显示全部',
  },
  'zh-tw': {
    myNetwork: '我的網絡', network: '網絡', direct: '直接邀請', qualified: '已完成', thisRound: '本輪', directNetwork: '直接網絡', invitedBy: '邀請人', backToMine: '返回我的網絡', searchPlaceholder: '在網絡中搜尋錢包', searchHint: '請輸入至少 3 個錢包地址字元。', searchResults: '搜尋結果', noSearchResults: '你的網絡中沒有相符的錢包。', sortBy: '排序', sortNetwork: '網絡規模', sortQualified: '已完成', sortGrowth: '近期成長', inProgress: '進行中', rewarded: '已獎勵', viewNetwork: '查看網絡', emptyTitle: '你的網絡從這裡開始', emptyDescription: '邀請符合資格的新用戶或回歸用戶。通過 VeInvite 資格驗證後會自動顯示在這裡。', inviteFriend: '邀請朋友', connectTitle: '連接錢包查看網絡', connectDescription: 'VeInvite 網絡僅能在已驗證的錢包工作階段查看。', connectWallet: '連接錢包', loadError: '無法載入網絡。', retry: '重試', generation: '代', downstream: '下級網絡', growth: '成長', clearFilter: '顯示全部',
  },
  ja: {
    myNetwork: 'マイネットワーク', network: 'ネットワーク', direct: '直接招待', qualified: 'ミッション完了', thisRound: '今ラウンド', directNetwork: '直接ネットワーク', invitedBy: '招待者', backToMine: '自分のネットワークへ', searchPlaceholder: 'ネットワーク内のウォレットを検索', searchHint: 'ウォレットアドレスを3文字以上入力してください。', searchResults: '検索結果', noSearchResults: 'ネットワーク内に一致するウォレットがありません。', sortBy: '並び替え', sortNetwork: 'ネットワーク規模', sortQualified: 'ミッション完了', sortGrowth: '最近の成長', inProgress: '進行中', rewarded: '報酬済み', viewNetwork: 'ネットワークを見る', emptyTitle: 'ここからネットワークが始まります', emptyDescription: '対象となる新規・復帰ユーザーを招待してください。VeInviteの参加資格確認を通過すると自動的に表示されます。', inviteFriend: '友だちを招待', connectTitle: 'ウォレットを接続してネットワークを確認', connectDescription: 'VeInviteネットワークは確認済みのウォレットセッションでのみ表示されます。', connectWallet: 'ウォレット接続', loadError: 'ネットワークを読み込めませんでした。', retry: '再試行', generation: '世代', downstream: '下位ネットワーク', growth: '増加', clearFilter: 'すべて表示',
  },
  vi: {
    myNetwork: 'Mạng lưới của tôi', network: 'Mạng lưới', direct: 'Mời trực tiếp', qualified: 'Đã hoàn thành', thisRound: 'Vòng này', directNetwork: 'Mạng trực tiếp', invitedBy: 'Được mời bởi', backToMine: 'Về mạng lưới của tôi', searchPlaceholder: 'Tìm ví trong mạng lưới', searchHint: 'Nhập ít nhất 3 ký tự của địa chỉ ví.', searchResults: 'Kết quả tìm kiếm', noSearchResults: 'Không tìm thấy ví phù hợp trong mạng lưới.', sortBy: 'Sắp xếp', sortNetwork: 'Quy mô mạng', sortQualified: 'Đã hoàn thành', sortGrowth: 'Tăng trưởng gần đây', inProgress: 'Đang thực hiện', rewarded: 'Đã nhận thưởng', viewNetwork: 'Xem mạng lưới', emptyTitle: 'Mạng lưới của bạn bắt đầu từ đây', emptyDescription: 'Mời người dùng mới hoặc quay lại đủ điều kiện. Sau khi vượt qua kiểm tra đầu vào VeInvite, họ sẽ tự động xuất hiện tại đây.', inviteFriend: 'Mời bạn bè', connectTitle: 'Kết nối ví để xem mạng lưới', connectDescription: 'Mạng lưới VeInvite chỉ hiển thị trong phiên ví đã được xác minh.', connectWallet: 'Kết nối ví', loadError: 'Không thể tải mạng lưới.', retry: 'Thử lại', generation: 'Thế hệ', downstream: 'Mạng phía dưới', growth: 'tăng', clearFilter: 'Hiện tất cả',
  },
  es: {
    myNetwork: 'Mi red', network: 'Red', direct: 'Directos', qualified: 'Completados', thisRound: 'Esta ronda', directNetwork: 'Red directa', invitedBy: 'Invitado por', backToMine: 'Volver a mi red', searchPlaceholder: 'Buscar wallet en tu red', searchHint: 'Escribe al menos 3 caracteres de la dirección.', searchResults: 'Resultados', noSearchResults: 'No se encontró esa wallet en tu red.', sortBy: 'Ordenar', sortNetwork: 'Tamaño de red', sortQualified: 'Completados', sortGrowth: 'Crecimiento reciente', inProgress: 'En progreso', rewarded: 'Recompensado', viewNetwork: 'Ver red', emptyTitle: 'Tu red empieza aquí', emptyDescription: 'Invita a un usuario nuevo o recurrente elegible. Cuando supere la verificación de entrada de VeInvite aparecerá aquí automáticamente.', inviteFriend: 'Invitar a un amigo', connectTitle: 'Conecta tu wallet para ver tu red', connectDescription: 'Tu red VeInvite solo está disponible en una sesión de wallet verificada.', connectWallet: 'Conectar wallet', loadError: 'No pudimos cargar tu red.', retry: 'Reintentar', generation: 'Generación', downstream: 'Red descendente', growth: 'crecimiento', clearFilter: 'Mostrar todo',
  },
};

function getText(locale: Locale): NetworkText {
  return {
    ...EN_TEXT,
    ...(TEXT_OVERRIDES[locale as SupportedLocale] ?? {}),
  };
}

function shortWallet(wallet: string, wide = false): string {
  if (wallet.length < 16) return wallet;
  return wide
    ? `${wallet.slice(0, 8)}…${wallet.slice(-6)}`
    : `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function statusLabel(status: NetworkMemberStatus, t: NetworkText): string {
  if (status === 'REWARDED') return t.rewarded;
  if (status === 'QUALIFIED') return t.qualified;
  return t.inProgress;
}

function statusIcon(status: NetworkMemberStatus): string {
  if (status === 'REWARDED') return '◆';
  if (status === 'QUALIFIED') return '✓';
  return '•';
}

export function AppNetwork({
  locale,
  wallet,
  onConnect,
  onInvite,
  dataEndpoint = '/api/network',
}: {
  locale: Locale;
  wallet: string | null;
  onConnect: () => void;
  onInvite: () => void;
  dataEndpoint?: string;
}) {
  const t = getText(locale);
  const nav = NETWORK_COPY[locale as SupportedLocale];
  const [focusWallet, setFocusWallet] = useState<string | null>(wallet);
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(Boolean(wallet));
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('network');
  const [branchFilter, setBranchFilter] = useState<BranchFilter>('all');
  const requestRef = useRef(0);
  const directListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFocusWallet(wallet);
    setData(null);
    setSearch('');
    setDebouncedSearch('');
    setBranchFilter('all');
    setError('');
  }, [wallet]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 260);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadNetwork = useCallback(async () => {
    if (!wallet || !focusWallet) return;
    const requestId = ++requestRef.current;
    const controller = new AbortController();

    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        wallet,
        focus: focusWallet,
      });
      if (debouncedSearch.length >= 3) {
        params.set('q', debouncedSearch);
      }

      const response = await fetch(`${dataEndpoint}?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = (await response.json()) as NetworkData & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || t.loadError);
      }
      if (requestRef.current !== requestId) return;
      setData(payload);
    } catch (loadError) {
      if (controller.signal.aborted || requestRef.current !== requestId) return;
      setError(loadError instanceof Error ? loadError.message : t.loadError);
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [wallet, focusWallet, debouncedSearch, t.loadError, dataEndpoint]);

  useEffect(() => {
    void loadNetwork();
  }, [loadNetwork]);

  const children = useMemo(() => {
    const source = data?.children ?? [];
    const filtered = source.filter((child) => {
      if (branchFilter === 'qualified') {
        return child.status === 'QUALIFIED' ||
          child.status === 'REWARDED' ||
          child.qualified > 0;
      }
      if (branchFilter === 'growth') return child.thisRound > 0;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sortMode === 'qualified') {
        return b.qualified - a.qualified || b.network - a.network;
      }
      if (sortMode === 'growth') {
        return b.thisRound - a.thisRound || b.network - a.network;
      }
      return b.network - a.network || b.qualified - a.qualified;
    });
  }, [data?.children, branchFilter, sortMode]);

  const featuredChildren = useMemo(
    () => [...(data?.children ?? [])]
      .sort((a, b) => b.network - a.network || b.qualified - a.qualified)
      .slice(0, 3),
    [data?.children],
  );

  const isMine = Boolean(
    wallet && data?.focusWallet &&
    wallet.toLowerCase() === data.focusWallet.toLowerCase(),
  );

  const focusLabel = isMine
    ? t.myNetwork
    : data?.focusWallet
      ? `${shortWallet(data.focusWallet, true)} · ${nav.navLabel}`
      : t.myNetwork;

  const scrollToDirect = () => {
    directListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const focusMember = (nextWallet: string) => {
    setFocusWallet(nextWallet);
    setSearch('');
    setDebouncedSearch('');
    setBranchFilter('all');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!wallet) {
    return (
      <section className="networkPage">
        <div className="networkConnectCard networkCard">
          <NetworkGlyph />
          <span className="eyebrow">{nav.navLabel}</span>
          <h1>{t.connectTitle}</h1>
          <p>{t.connectDescription}</p>
          <button type="button" className="primaryButton" onClick={onConnect}>
            {t.connectWallet}
          </button>
        </div>
        <NetworkStyles />
      </section>
    );
  }

  return (
    <section className="networkPage" aria-busy={loading}>
      <header className="networkHeader">
        <div className="headerTitleRow">
          <div>
            <span className="eyebrow">{nav.navLabel}</span>
            <h1>{focusLabel}</h1>
          </div>
          {!isMine && data ? (
            <button
              type="button"
              className="backButton"
              onClick={() => focusMember(wallet)}
            >
              <span aria-hidden="true">←</span>
              {t.backToMine}
            </button>
          ) : null}
        </div>

        {data && data.breadcrumb.length > 1 ? (
          <nav className="breadcrumb" aria-label="Network path">
            {data.breadcrumb.map((address, index) => (
              <span key={address} className="breadcrumbItem">
                {index > 0 ? <span className="crumbDivider">›</span> : null}
                <button
                  type="button"
                  className="crumbButton"
                  onClick={() => focusMember(address)}
                  aria-current={index === data.breadcrumb.length - 1 ? 'page' : undefined}
                >
                  {index === 0 ? t.myNetwork : shortWallet(address)}
                </button>
              </span>
            ))}
          </nav>
        ) : null}

        {data?.invitedBy ? (
          <div className="invitedByRow">
            <span>{t.invitedBy}</span>
            <button type="button" onClick={() => {
              if (data.breadcrumb.includes(data.invitedBy!)) focusMember(data.invitedBy!);
            }}>
              {shortWallet(data.invitedBy, true)}
            </button>
          </div>
        ) : null}
      </header>

      {error && !data ? (
        <div className="networkError networkCard" role="alert">
          <span className="errorIcon" aria-hidden="true">!</span>
          <strong>{t.loadError}</strong>
          <small>{error}</small>
          <button type="button" className="secondaryButton" onClick={() => void loadNetwork()}>
            {t.retry}
          </button>
        </div>
      ) : loading && !data ? (
        <NetworkSkeleton />
      ) : data ? (
        <>
          <section className="networkSummary networkCard">
            <div className="summaryTopline">
              <div>
                <span className="summaryLabel">{isMine ? t.myNetwork : nav.navLabel}</span>
                <strong>{data.summary.network.toLocaleString()}</strong>
                <small>{t.downstream}</small>
              </div>
              {data.round ? (
                <span className="roundBadge">R{data.round.id}</span>
              ) : null}
            </div>

            <div className="metricGrid">
              <button
                type="button"
                className={branchFilter === 'all' ? 'metric activeMetric' : 'metric'}
                onClick={() => {
                  setBranchFilter('all');
                  scrollToDirect();
                }}
              >
                <strong>{data.summary.network.toLocaleString()}</strong>
                <span>{t.network}</span>
              </button>
              <button type="button" className="metric" onClick={scrollToDirect}>
                <strong>{data.summary.direct.toLocaleString()}</strong>
                <span>{t.direct}</span>
              </button>
              <button
                type="button"
                className={branchFilter === 'qualified' ? 'metric activeMetric' : 'metric'}
                onClick={() => {
                  setBranchFilter('qualified');
                  scrollToDirect();
                }}
              >
                <strong>{data.summary.qualified.toLocaleString()}</strong>
                <span>{t.qualified}</span>
              </button>
              <button
                type="button"
                className={branchFilter === 'growth' ? 'metric activeMetric' : 'metric'}
                onClick={() => {
                  setBranchFilter('growth');
                  scrollToDirect();
                }}
              >
                <strong>+{data.summary.thisRound.toLocaleString()}</strong>
                <span>{t.thisRound}</span>
              </button>
            </div>

            <div className="treeStage" aria-label={`${t.directNetwork}: ${data.summary.direct}`}>
              <button type="button" className="rootNode" aria-current="true">
                <span className="rootHalo" />
                <span className="nodeAvatar">{isMine ? 'YOU' : shortWallet(data.focusWallet)}</span>
                <small>{data.summary.network.toLocaleString()} {t.network}</small>
              </button>

              {featuredChildren.length > 0 ? (
                <>
                  <span className="treeStem" aria-hidden="true" />
                  <div className={`treeChildren count${featuredChildren.length}`}>
                    {featuredChildren.map((child) => (
                      <button
                        type="button"
                        className={`treeNode status-${child.status.toLowerCase()}`}
                        key={child.wallet}
                        onClick={() => focusMember(child.wallet)}
                      >
                        <span className="treeNodeIcon" aria-hidden="true">
                          {statusIcon(child.status)}
                        </span>
                        <strong>{shortWallet(child.wallet)}</strong>
                        <small>{child.network.toLocaleString()} {t.network}</small>
                      </button>
                    ))}
                  </div>
                  {(data.children.length - featuredChildren.length) > 0 ? (
                    <button type="button" className="moreNode" onClick={scrollToDirect}>
                      +{data.children.length - featuredChildren.length} {t.more}
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </section>

          <section className="searchCard networkCard">
            <div className="searchField">
              <SearchIcon />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.searchPlaceholder}
                inputMode="text"
              />
              {search ? (
                <button type="button" className="clearSearch" onClick={() => setSearch('')} aria-label={t.clearFilter}>×</button>
              ) : null}
            </div>
            {search.length > 0 && search.length < 3 ? <small className="searchHint">{t.searchHint}</small> : null}
            {debouncedSearch.length >= 3 ? (
              loading ? <div className="searchLoading" /> : data.searchResults.length > 0 ? (
                <div className="searchResults">
                  <strong>{t.searchResults}</strong>
                  {data.searchResults.map((result) => (
                    <button key={result.wallet} type="button" onClick={() => focusMember(result.wallet)}>
                      <span>{shortWallet(result.wallet, true)}</span>
                      <small>{t.generation} {result.depth}</small>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
              ) : <small className="noSearchResults">{t.noSearchResults}</small>
            ) : null}
          </section>

          <section className="directSection" ref={directListRef}>
            <div className="sectionHeading">
              <div>
                <span className="eyebrow">{nav.navLabel}</span>
                <h2>{t.directNetwork}</h2>
              </div>
              <label className="sortControl">
                <span className="srOnly">{t.sortBy}</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  <option value="network">{t.sortNetwork}</option>
                  <option value="qualified">{t.sortQualified}</option>
                  <option value="growth">{t.sortGrowth}</option>
                </select>
              </label>
            </div>

            {branchFilter !== 'all' ? (
              <button type="button" className="filterPill" onClick={() => setBranchFilter('all')}>
                {branchFilter === 'qualified' ? t.qualified : t.thisRound}
                <span aria-hidden="true">×</span>
                <small>{t.clearFilter}</small>
              </button>
            ) : null}

            {children.length > 0 ? (
              <div className="memberList">
                {children.map((child) => (
                  <article className="memberCard networkCard" key={child.wallet}>
                    <div className="memberTopRow">
                      <button type="button" className="memberIdentity" onClick={() => focusMember(child.wallet)}>
                        <span className={`memberAvatar status-${child.status.toLowerCase()}`}>
                          {statusIcon(child.status)}
                        </span>
                        <span>
                          <strong>{shortWallet(child.wallet, true)}</strong>
                          <small className={`statusText status-${child.status.toLowerCase()}`}>
                            {statusLabel(child.status, t)}
                          </small>
                        </span>
                      </button>
                      <button type="button" className="chevronButton" onClick={() => focusMember(child.wallet)} aria-label={t.viewNetwork}>›</button>
                    </div>

                    <div className="memberMetrics">
                      <span><strong>{child.network.toLocaleString()}</strong><small>{t.network}</small></span>
                      <span><strong>{child.direct.toLocaleString()}</strong><small>{t.direct}</small></span>
                      <span><strong>{child.qualified.toLocaleString()}</strong><small>{t.qualified}</small></span>
                      <span><strong>+{child.thisRound.toLocaleString()}</strong><small>{t.thisRound}</small></span>
                    </div>

                    <div className="memberActions">
                      <button type="button" onClick={() => focusMember(child.wallet)}>
                        {t.viewNetwork}<span aria-hidden="true">›</span>
                      </button>
                      <a
                        href={`https://block-explorer.vechain.org/address/${child.wallet}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.openExplorer}<span aria-hidden="true">↗</span>
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : data.summary.direct === 0 ? (
              <div className="emptyNetwork networkCard">
                <NetworkGlyph />
                <h3>{t.emptyTitle}</h3>
                <p>{t.emptyDescription}</p>
                <button type="button" className="primaryButton" onClick={onInvite}>{t.inviteFriend}</button>
              </div>
            ) : (
              <div className="emptyFilter networkCard">
                <p>{branchFilter === 'qualified' ? t.qualified : t.thisRound}</p>
                <button type="button" className="secondaryButton" onClick={() => setBranchFilter('all')}>{t.clearFilter}</button>
              </div>
            )}
          </section>

          {data.depthLimitReached ? (
            <div className="depthNotice" role="status">{t.depthLimit}</div>
          ) : null}
        </>
      ) : null}

      {error && data ? (
        <div className="inlineError" role="status">
          <span>{t.loadError}</span>
          <button type="button" onClick={() => void loadNetwork()}>{t.retry}</button>
        </div>
      ) : null}

      <NetworkStyles />
    </section>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function NetworkGlyph() {
  return (
    <div className="networkGlyph" aria-hidden="true">
      <span className="glyphNode glyphRoot">●</span>
      <span className="glyphNode glyphLeft">●</span>
      <span className="glyphNode glyphRight">●</span>
      <span className="glyphLine glyphLineLeft" />
      <span className="glyphLine glyphLineRight" />
    </div>
  );
}

function NetworkSkeleton() {
  return (
    <div className="networkSkeleton" aria-hidden="true">
      <div className="skeletonCard skeletonSummary"><span /><span /><span /><span /></div>
      <div className="skeletonCard skeletonSearch" />
      <div className="skeletonHeading" />
      <div className="skeletonCard skeletonMember" />
      <div className="skeletonCard skeletonMember" />
      <style jsx>{`
        .networkSkeleton{display:grid;gap:14px}.skeletonCard{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.07);border-radius:24px;background:rgba(255,255,255,.025)}.skeletonCard::after,.skeletonHeading::after{content:'';position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent);animation:networkShimmer 1.4s infinite}.skeletonSummary{height:330px;display:grid;grid-template-columns:repeat(4,1fr);align-items:end;padding:20px;gap:8px;box-sizing:border-box}.skeletonSummary span{height:62px;border-radius:14px;background:rgba(255,255,255,.045)}.skeletonSearch{height:72px}.skeletonHeading{position:relative;overflow:hidden;width:44%;height:26px;margin:10px 0;border-radius:999px;background:rgba(255,255,255,.04)}.skeletonMember{height:190px}@keyframes networkShimmer{to{transform:translateX(100%)}}
      `}</style>
    </div>
  );
}

function NetworkStyles() {
  return (
    <style jsx>{`
      .networkPage{width:min(100%,520px);margin:0 auto;padding-bottom:10px;color:#f7f3e9}.networkHeader{margin:0 2px 15px}.headerTitleRow{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.eyebrow{display:block;color:#e8b83f;font-size:.64rem;font-weight:950;letter-spacing:.08em;text-transform:uppercase}.networkHeader h1{margin:6px 0 0;font-size:clamp(1.65rem,6vw,2.2rem);line-height:1.06;letter-spacing:-.045em;overflow-wrap:anywhere}.backButton{flex:0 0 auto;max-width:46%;min-height:38px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid rgba(255,205,80,.14);border-radius:12px;background:rgba(255,205,80,.045);color:#d7c89c;font:inherit;font-size:.66rem;font-weight:850;cursor:pointer}.breadcrumb{margin-top:12px;display:flex;align-items:center;gap:3px;overflow-x:auto;scrollbar-width:none}.breadcrumb::-webkit-scrollbar{display:none}.breadcrumbItem{display:inline-flex;align-items:center;gap:3px;flex:0 0 auto}.crumbDivider{color:#57534b}.crumbButton{padding:4px 5px;border:0;background:transparent;color:#77736c;font:inherit;font-size:.65rem;font-weight:800;cursor:pointer}.crumbButton[aria-current='page']{color:#d6cba9}.invitedByRow{margin-top:7px;display:flex;align-items:center;gap:7px;color:#77736c;font-size:.64rem}.invitedByRow button{padding:0;border:0;background:transparent;color:#aaa391;font:inherit;font-size:inherit;font-weight:800;cursor:pointer}.networkCard{box-sizing:border-box;border:1px solid rgba(255,205,80,.12);border-radius:26px;background:linear-gradient(150deg,rgba(31,29,23,.98),rgba(14,14,13,.99));box-shadow:0 18px 50px rgba(0,0,0,.22)}.networkSummary{position:relative;overflow:hidden;padding:20px}.networkSummary::before{content:'';position:absolute;top:-100px;right:-80px;width:240px;height:240px;border-radius:50%;background:rgba(244,183,40,.105);pointer-events:none}.summaryTopline{position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.summaryTopline>div{display:grid;grid-template-columns:auto auto;grid-template-rows:auto auto;column-gap:8px;align-items:end}.summaryLabel{grid-column:1/-1;color:#918a78;font-size:.66rem;font-weight:800}.summaryTopline strong{font-size:2.55rem;line-height:1;letter-spacing:-.06em;color:#fff}.summaryTopline small{padding-bottom:3px;color:#8e897d;font-size:.67rem;font-weight:800}.roundBadge{padding:6px 9px;border:1px solid rgba(255,210,80,.18);border-radius:999px;background:rgba(255,210,80,.055);color:#efc65e;font-size:.62rem;font-weight:950}.metricGrid{position:relative;z-index:1;margin-top:18px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.metric{min-width:0;min-height:66px;padding:9px 5px;border:1px solid rgba(255,255,255,.065);border-radius:15px;background:rgba(255,255,255,.025);color:#eee9de;font:inherit;cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .1s ease}.metric:active{transform:scale(.985)}.metric strong{display:block;font-size:1.05rem;letter-spacing:-.035em}.metric span{display:block;margin-top:3px;overflow:hidden;color:#7d796f;font-size:.57rem;font-weight:850;white-space:nowrap;text-overflow:ellipsis}.metric.activeMetric{border-color:rgba(244,183,40,.25);background:rgba(244,183,40,.07)}.metric.activeMetric span{color:#d2ad54}.treeStage{position:relative;z-index:1;min-height:188px;margin-top:18px;padding-top:3px;display:flex;flex-direction:column;align-items:center}.rootNode{position:relative;z-index:3;min-width:106px;padding:10px 13px;border:1px solid rgba(255,214,105,.32);border-radius:17px;background:linear-gradient(145deg,#292113,#18150e);color:#fff;font:inherit;box-shadow:0 10px 30px rgba(0,0,0,.27);cursor:default}.rootHalo{position:absolute;inset:-8px;border:1px solid rgba(244,183,40,.075);border-radius:23px;pointer-events:none}.nodeAvatar{display:block;font-size:.68rem;font-weight:950}.rootNode small{display:block;margin-top:3px;color:#b99b51;font-size:.57rem;font-weight:800}.treeStem{width:1px;height:23px;background:linear-gradient(rgba(244,183,40,.42),rgba(244,183,40,.12))}.treeChildren{position:relative;width:100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.treeChildren.count1{grid-template-columns:minmax(0,150px);justify-content:center}.treeChildren.count2{grid-template-columns:repeat(2,minmax(0,150px));justify-content:center}.treeChildren::before{content:'';position:absolute;top:-1px;left:16.66%;right:16.66%;height:1px;background:linear-gradient(90deg,transparent,rgba(244,183,40,.3) 12%,rgba(244,183,40,.3) 88%,transparent)}.treeChildren.count1::before{display:none}.treeChildren.count2::before{left:25%;right:25%}.treeNode{position:relative;min-width:0;min-height:62px;padding:12px 6px 8px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:rgba(7,7,7,.38);color:#dcd7cd;font:inherit;cursor:pointer}.treeNode::before{content:'';position:absolute;top:-10px;left:50%;width:1px;height:10px;background:rgba(244,183,40,.23)}.treeNodeIcon{position:absolute;top:-8px;left:50%;width:18px;height:18px;display:grid;place-items:center;transform:translateX(-50%);border:1px solid rgba(255,255,255,.12);border-radius:50%;background:#191711;color:#9f9a8f;font-size:.61rem;font-weight:950}.treeNode.status-qualified .treeNodeIcon,.memberAvatar.status-qualified{border-color:rgba(83,212,151,.3);color:#65d7a0}.treeNode.status-rewarded .treeNodeIcon,.memberAvatar.status-rewarded{border-color:rgba(244,183,40,.35);color:#f3c75c}.treeNode strong{display:block;overflow:hidden;font-size:.61rem;text-overflow:ellipsis;white-space:nowrap}.treeNode small{display:block;margin-top:4px;color:#716d65;font-size:.54rem;font-weight:750}.moreNode{margin-top:9px;padding:5px 9px;border:0;border-radius:999px;background:rgba(255,255,255,.035);color:#817c70;font:inherit;font-size:.58rem;font-weight:850;cursor:pointer}.searchCard{margin-top:13px;padding:10px}.searchField{min-height:48px;padding:0 12px;display:flex;align-items:center;gap:9px;border:1px solid rgba(255,255,255,.075);border-radius:16px;background:rgba(4,4,4,.38);color:#6e6a62}.searchField input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#f3efe6;font:inherit;font-size:.72rem;font-weight:750}.searchField input::placeholder{color:#5e5b55}.clearSearch{width:25px;height:25px;border:0;border-radius:50%;background:rgba(255,255,255,.05);color:#7f7a71;font-size:1rem;cursor:pointer}.searchHint,.noSearchResults{display:block;padding:8px 6px 2px;color:#747068;font-size:.62rem;line-height:1.45}.searchResults{padding:8px 4px 3px}.searchResults>strong{display:block;padding:1px 4px 5px;color:#aaa493;font-size:.63rem}.searchResults>button{width:100%;min-height:40px;padding:7px 5px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:8px;border:0;border-top:1px solid rgba(255,255,255,.045);background:transparent;color:#cbc5b7;text-align:left;font:inherit;cursor:pointer}.searchResults>button span:first-child{overflow:hidden;font-size:.67rem;font-weight:850;text-overflow:ellipsis}.searchResults>button small{color:#706c64;font-size:.57rem}.searchLoading{height:34px;margin:3px 5px;border-radius:10px;background:rgba(255,255,255,.035)}.directSection{scroll-margin-top:16px;margin-top:24px}.sectionHeading{display:flex;align-items:end;justify-content:space-between;gap:12px;padding:0 2px 10px}.sectionHeading h2{margin:4px 0 0;font-size:1.25rem;letter-spacing:-.035em}.sortControl select{max-width:145px;height:34px;padding:0 28px 0 10px;border:1px solid rgba(255,255,255,.075);border-radius:11px;background:#151512;color:#a8a294;font:inherit;font-size:.61rem;font-weight:800}.filterPill{margin:0 0 9px;padding:7px 9px;display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(244,183,40,.16);border-radius:999px;background:rgba(244,183,40,.06);color:#d4b055;font:inherit;font-size:.61rem;font-weight:850;cursor:pointer}.filterPill small{color:#766c50;font-size:.54rem}.memberList{display:grid;gap:10px}.memberCard{padding:15px}.memberTopRow{display:flex;align-items:center;justify-content:space-between;gap:10px}.memberIdentity{min-width:0;flex:1;padding:0;display:flex;align-items:center;gap:10px;border:0;background:transparent;color:#eae5da;text-align:left;font:inherit;cursor:pointer}.memberAvatar{width:34px;height:34px;display:grid;place-items:center;flex:0 0 auto;border:1px solid rgba(255,255,255,.09);border-radius:50%;background:#121211;color:#8d887e;font-size:.72rem;font-weight:950}.memberIdentity>span:last-child{min-width:0}.memberIdentity strong{display:block;overflow:hidden;font-size:.73rem;text-overflow:ellipsis}.memberIdentity small{display:block;margin-top:3px;font-size:.58rem;font-weight:800}.statusText.status-in_progress{color:#827e76}.statusText.status-qualified{color:#62c994}.statusText.status-rewarded{color:#d4af50}.chevronButton{width:30px;height:30px;border:0;border-radius:50%;background:rgba(255,255,255,.035);color:#777269;font-size:1rem;cursor:pointer}.memberMetrics{margin-top:14px;padding:11px 0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid rgba(255,255,255,.055);border-bottom:1px solid rgba(255,255,255,.055)}.memberMetrics span{min-width:0;padding:0 6px;border-left:1px solid rgba(255,255,255,.045)}.memberMetrics span:first-child{border-left:0;padding-left:0}.memberMetrics strong{display:block;color:#e6e0d3;font-size:.79rem}.memberMetrics small{display:block;margin-top:2px;overflow:hidden;color:#68645e;font-size:.52rem;font-weight:800;white-space:nowrap;text-overflow:ellipsis}.memberActions{margin-top:11px;display:flex;align-items:center;justify-content:space-between;gap:8px}.memberActions button,.memberActions a{min-height:29px;padding:0;border:0;background:transparent;color:#a49d8f;font:inherit;font-size:.59rem;font-weight:850;text-decoration:none;cursor:pointer}.memberActions span{margin-left:5px;color:#625e57}.networkConnectCard,.emptyNetwork,.networkError{padding:34px 24px;text-align:center}.networkConnectCard{margin-top:22px}.networkConnectCard h1,.emptyNetwork h3{margin:16px 0 8px;color:#f1ede4;font-size:1.25rem;letter-spacing:-.035em}.networkConnectCard p,.emptyNetwork p{max-width:330px;margin:0 auto;color:#817d75;font-size:.7rem;line-height:1.6}.primaryButton,.secondaryButton{min-height:38px;padding:0 15px;border-radius:12px;font:inherit;font-size:.66rem;font-weight:900;cursor:pointer}.primaryButton{margin-top:18px;border:1px solid rgba(244,183,40,.25);background:#e3aa26;color:#15120b}.secondaryButton{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);color:#aaa397}.emptyFilter{padding:28px;text-align:center;color:#777168}.emptyFilter .secondaryButton{margin-top:11px}.networkError{display:grid;justify-items:center;gap:8px}.networkError .errorIcon{width:34px;height:34px;display:grid;place-items:center;border:1px solid rgba(255,104,92,.2);border-radius:50%;color:#df8278}.networkError small{color:#796f69}.depthNotice,.inlineError{margin-top:12px;padding:10px 12px;border:1px solid rgba(255,255,255,.055);border-radius:12px;color:#776f65;font-size:.6rem;text-align:center}.inlineError{display:flex;align-items:center;justify-content:space-between;gap:8px}.inlineError button{border:0;background:transparent;color:#c09a40;font:inherit;font-size:inherit;font-weight:850;cursor:pointer}.networkGlyph{position:relative;width:76px;height:56px;margin:0 auto}.glyphNode{position:absolute;z-index:2;width:16px;height:16px;display:grid;place-items:center;color:#c5962e;font-size:.48rem}.glyphRoot{top:0;left:30px}.glyphLeft{bottom:0;left:7px}.glyphRight{bottom:0;right:7px}.glyphLine{position:absolute;top:19px;width:1px;height:28px;transform-origin:top;background:rgba(202,154,47,.4)}.glyphLineLeft{left:35px;transform:rotate(42deg)}.glyphLineRight{right:35px;transform:rotate(-42deg)}.srOnly{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:420px){.networkSummary{padding:17px}.metricGrid{gap:5px}.metric{min-height:62px;padding:8px 3px}.metric span{font-size:.52rem}.treeChildren{gap:5px}.memberCard{padding:14px}.memberMetrics span{padding:0 4px}.memberMetrics small{font-size:.49rem}.sectionHeading h2{font-size:1.16rem}.sortControl select{max-width:122px}}@media(prefers-reduced-motion:reduce){.metric,.networkSkeleton *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
    `}</style>
  );
}
