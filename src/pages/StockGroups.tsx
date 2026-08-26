import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { getGroupHeat } from '../api/groupHeat';
import { getHoldings } from '../api/portfolio';
import { getRealtimeQuote } from '../api/realtimeQuote';
import { apiErrorMessage } from '../api/request';
import {
  getGroupMembers,
  getGroupPeers,
  removeStockGroup,
  saveStockGroup,
} from '../api/stockGroup';
import { GroupHeat, GroupMember, GroupPeer, Holding, StockGroup } from '../api/types';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  DASH,
  formatAmount,
  formatNumber,
  formatPercent,
  formatSigned,
  formatSignedPercent,
  formatThousandTWD,
  quoteColor,
} from '../utils/format';

// 自己維護的主題族群：誰屬於散熱（上半頁，可編輯），以及散熱今天有沒有在動（下半頁，唯讀）。
//
// 為什麼要自己維護一份：官方產業別在「同類放一起」這件事上兩個方向都失敗。
// 矽晶圓的中美晶、環球晶、台勝科官方全歸「半導體業」（一百多家，台積電也在裡面，
// 比不出東西）；散熱的雙鴻、高力、奇鋐則分屬其他電子業、電機機械、電腦及週邊設備業，
// 永遠不會出現在同一張表。族群是人工歸類的概念，免費資料源沒有任何一家提供。
//
// 這一頁原本是「設定」頁裡的一個區塊。搬出來獨立成一頁是因為它跟手續費那張表的
// 性質差很遠：手續費設好幾乎不會再動，族群則是天天在調整的工作區，而且調完會想
// 立刻看到那一群今天的表現——熱度榜就在同一頁往下捲。

const headCell =
  'p-2 font-label-caps text-label-caps text-on-surface-variant uppercase whitespace-nowrap';
const numCell = 'p-2 py-3 text-right font-data-md text-data-md';
const inputClass =
  'px-2 py-1.5 bg-surface-container border border-outline-variant rounded font-body-md text-body-md text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary';

type Tab = 'edit' | 'heat';

// 分頁而不是上下堆疊，理由同全市場排行那一頁：兩塊的性質差很遠，堆在一起會很長，
// 而且會讓人以為熱度榜是「剛剛編的那個族群的」——它是全部族群的當日橫斷面。
//
//   族群維護  自己維護的清單，隨時可改，改完立刻生效
//   今日熱度  收盤後才算得出來的橫斷面，唯讀，一天只變一次
const TABS: { value: Tab; label: string; hint: string }[] = [
  { value: 'edit', label: '族群維護', hint: '自己歸類，隨時可改' },
  { value: 'heat', label: '今日熱度', hint: '收盤後才有，一天一次' },
];

export default function StockGroups() {
  const [tab, setTab] = useState<Tab>('edit');

  return (
    <>
      <PageHeader
        title="主題族群"
        icon="workspaces"
        subtitle="自己歸類的題材族群，以及各族群今天的資金與擴散度"
      />

      <div className="flex flex-col gap-stack-lg">
        <div className="flex flex-wrap gap-stack-sm border-b border-outline-variant">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
                tab === item.value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="font-body-md text-body-md font-semibold">{item.label}</span>
              <span className="block font-body-sm text-body-sm text-on-surface-variant">
                {item.hint}
              </span>
            </button>
          ))}
        </div>

        <p className="font-body-sm text-body-sm text-on-surface-variant">
          族群是人工維護的，<span className="text-on-surface font-semibold">官方產業別做不到</span>
          ：矽晶圓的中美晶、環球晶、台勝科官方全歸「半導體業」（一百多家，台積電也在裡面）；
          散熱的雙鴻、高力、奇鋐則分屬其他電子業、電機機械、電腦及週邊設備業，
          官方分類永遠不會把它們放在一起。個股總覽的「主題族群」區塊與這裡的熱度榜都吃這份設定。
          破折號一律代表「沒有這個數字」而不是 0。
        </p>

        {/* 兩塊都保持掛載會讓熱度榜在編族群時照樣去打一次收盤資料，所以切換時才載入。 */}
        {tab === 'edit' ? <GroupPanel /> : <HeatBoard />}
      </div>
    </>
  );
}

/** 族群編輯中的草稿。 */
interface GroupDraft {
  // 伺服器上的 id。空字串代表「還沒建的新族群」那一列。
  id: string;
  name: string;
  // 成員代號，順序有意義（使用者可能刻意把龍頭放第一個），後端照原順序存。
  symbols: string[];
  sortOrder: string;
}

const NEW_GROUP: GroupDraft = { id: '', name: '', symbols: [], sortOrder: '' };

function toGroupDraft(group: StockGroup): GroupDraft {
  return {
    id: group.id,
    name: group.name,
    symbols: [...group.symbols],
    sortOrder: String(group.sort_order),
  };
}

/**
 * 逗號、頓號、空白、換行都當分隔。
 *
 * 成員改成一個一個挑之後仍然保留這個：從報告或聊天室貼一整串代號進來是最快的建群方式，
 * 只支援單筆輸入等於把那個用法拿掉。
 */
function parseSymbols(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,，、;；]+/)) {
    const symbol = raw.trim().toUpperCase();
    if (symbol) seen.add(symbol);
  }
  return Array.from(seen);
}

/** 一次貼太多檔時不要逐檔去問名稱：那是打 MIS 的，二十幾個請求會被限流。 */
const NAME_LOOKUP_LIMIT = 8;

/**
 * 族群的維護介面：新增、加減成員、改順序、改排序、刪除。
 *
 * 成員是一個一個的 chip 而不是一格文字：代號本身讀不出是哪一家公司，
 * 「3324 8996 3017」要對著看盤軟體查三次才知道自己在編什麼。
 */
function GroupPanel() {
  // 族群清單與成員名稱一次拿完。這一支完全不打上游（只讀族群表、月營收與自選股
  // 三張表），所以整份族群一載入就有名稱——不必展開、也不必逐檔去問報價。
  const members = useAsyncData(() => getGroupMembers(), []);
  const entries = members.data?.items ?? [];

  // 自選股清單只給新增時的下拉建議用。族群成員不必在自選股裡，
  // 所以它不是名稱的主要來源，只是「挑一檔已經在追蹤的」比較快。
  const holdings = useAsyncData(() => getHoldings(), []);

  const [drafts, setDrafts] = useState<GroupDraft[]>([]);
  const [creating, setCreating] = useState<GroupDraft>(NEW_GROUP);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  // 一次只展開一個族群。成員明細那一支會逐檔去問 Yahoo 的日 K（週漲跌幅那一欄），
  // 全部展開等於一次打好幾十檔，上游會回 429。
  const [openId, setOpenId] = useState('');

  // 代號→名稱。來源疊上去，先到的不會被後到的蓋掉：
  //   1. /stocks/groups/members（已儲存的成員，一次拿完，這是主要來源）
  //   2. 自選股清單
  //   3. **還沒儲存**的新成員：剛加進來的那一檔不在上面兩份裡，去問一次即時報價
  // 查不到就顯示代號本身，不擋任何操作——名稱只是幫忙確認，不是必要資料。
  const [names, setNames] = useState<Record<string, string>>({});

  const learnNames = useCallback((entries: { symbol: string; name: string }[]) => {
    setNames((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const entry of entries) {
        if (entry.name && !next[entry.symbol]) {
          next[entry.symbol] = entry.name;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // deps 放 members.data 而不是 entries：後者每次 render 都是新陣列，會讓這個
  // effect 每次都跑一遍（learnNames 擋得住無謂的 setState，但沒必要每次繞一圈）。
  useEffect(() => {
    for (const entry of members.data?.items ?? []) learnNames(entry.members);
  }, [members.data, learnNames]);

  useEffect(() => {
    if (holdings.data) learnNames(holdings.data);
  }, [holdings.data, learnNames]);

  // 存檔後重抓，本地編輯一律以伺服器為準蓋回去。族群沒有「未儲存草稿」的需求，
  // 留著反而會出現「畫面上有但其實沒存到」。
  useEffect(() => {
    if (members.data) setDrafts(members.data.items.map((entry) => toGroupDraft(entry.group)));
  }, [members.data]);

  // 成員明細只問一檔：peers 那一支回的是「這一檔所屬的每一個族群，各自帶完整成員」，
  // 所以拿族群的第一個成員去問，就會拿回整個族群的名單，不必逐檔打。
  //
  // 用伺服器上的成員而不是編輯中的草稿：草稿每加一檔都會變，那會變成邊編邊打上游。
  const openGroup = entries.find((entry) => entry.group.id === openId)?.group;
  const seed = openGroup?.symbols[0] ?? '';
  const peers = useAsyncData(() => getGroupPeers(seed), [seed], { enabled: !!seed });
  const detail = peers.data?.find((entry) => entry.group.id === openId);

  // 展開過的族群，名稱留在字典裡：收合之後 chip 上仍然看得到是哪幾家公司。
  useEffect(() => {
    for (const entry of peers.data ?? []) learnNames(entry.peers);
  }, [peers.data, learnNames]);

  /** 補查名稱。查不到（MIS 收盤後常掛）就維持只有代號，不視為錯誤。 */
  const lookupNames = useCallback(
    async (symbols: string[]) => {
      const unknown = symbols.filter((symbol) => !names[symbol]).slice(0, NAME_LOOKUP_LIMIT);
      for (const symbol of unknown) {
        try {
          const quote = await getRealtimeQuote(symbol);
          // 後端沒查到會回 404（走 catch）；回了但沒有名稱就當作查不到。
          if (quote?.name) learnNames([{ symbol: quote.symbol, name: quote.name }]);
        } catch {
          // 代號打錯、MIS 收盤後掛掉都會走到這裡。名稱是輔助資訊，不擋新增。
        }
      }
    },
    [names, learnNames]
  );

  const patch = (id: string, next: Partial<GroupDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...next } : d)));

  const save = async (draft: GroupDraft, isNew: boolean) => {
    const name = draft.name.trim();
    if (!name) {
      setNotice('族群要有名稱');
      return;
    }
    const order = Number(draft.sortOrder);
    if (draft.sortOrder !== '' && !Number.isFinite(order)) {
      setNotice('排序要填數字');
      return;
    }
    setBusy(draft.id || '__new__');
    setNotice('');
    try {
      await saveStockGroup({
        name,
        symbols: draft.symbols,
        sort_order: draft.sortOrder === '' ? 0 : Math.trunc(order),
      });
      if (isNew) setCreating(NEW_GROUP);
      members.reload();
      setNotice(`已儲存「${name}」`);
    } catch (err) {
      setNotice(apiErrorMessage(err));
    } finally {
      setBusy('');
    }
  };

  const remove = async (draft: GroupDraft) => {
    if (!window.confirm(`刪掉族群「${draft.name}」？只刪分類，不影響自選股與持股。`)) return;
    setBusy(draft.id);
    setNotice('');
    try {
      await removeStockGroup(draft.id);
      if (openId === draft.id) setOpenId('');
      members.reload();
      setNotice(`已刪掉「${draft.name}」`);
    } catch (err) {
      setNotice(apiErrorMessage(err));
    } finally {
      setBusy('');
    }
  };

  /** 一個族群的編輯卡。新增用的那張除了按鈕文案與展開區之外長得一樣。 */
  const renderCard = (draft: GroupDraft, isNew: boolean) => {
    const key = isNew ? '__new__' : draft.id;
    const isOpen = !isNew && openId === draft.id;
    const saved = entries.find((entry) => entry.group.id === draft.id)?.group;
    // 存檔前後的成員可能不一樣，展開區顯示的一律是伺服器上的那一份。
    const dirty = !isNew && saved != null && saved.symbols.join(' ') !== draft.symbols.join(' ');
    // 名稱就是後端的鍵，改名會建出另一個族群而不是改名。在按下儲存之前就要講。
    const renaming = !isNew && saved != null && saved.name !== draft.name.trim();

    const update = (next: Partial<GroupDraft>) =>
      isNew ? setCreating((prev) => ({ ...prev, ...next })) : patch(draft.id, next);

    const addSymbols = (text: string) => {
      const incoming = parseSymbols(text).filter((symbol) => !draft.symbols.includes(symbol));
      if (incoming.length === 0) return;
      update({ symbols: [...draft.symbols, ...incoming] });
      void lookupNames(incoming);
    };

    const removeSymbol = (symbol: string) =>
      update({ symbols: draft.symbols.filter((s) => s !== symbol) });

    /** 往前或往後挪一格。順序有意義：使用者可能刻意把龍頭放第一個。 */
    const moveSymbol = (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= draft.symbols.length) return;
      const next = [...draft.symbols];
      [next[index], next[target]] = [next[target], next[index]];
      update({ symbols: next });
    };

    return (
      <div
        key={key}
        className={`rounded-xl border p-4 flex flex-col gap-stack-sm ${
          isNew
            ? 'border-dashed border-outline-variant bg-surface-container-low/40'
            : 'border-outline-variant bg-surface-container-lowest'
        }`}
      >
        <div className="flex flex-wrap items-end gap-stack-sm">
          <label className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              族群名稱
            </span>
            <input
              value={draft.name}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="散熱"
              className={`${inputClass} w-40`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              排序
            </span>
            <input
              value={draft.sortOrder}
              onChange={(event) => update({ sortOrder: event.target.value })}
              inputMode="numeric"
              placeholder="0"
              title="小的排前面"
              className={`${inputClass} w-20 font-data-md text-data-md text-right`}
            />
          </label>
          <span className="inline-flex gap-2 pb-0.5 ml-auto">
            <button
              type="button"
              onClick={() => save(draft, isNew)}
              disabled={busy !== ''}
              className="px-3 py-1.5 bg-primary rounded text-on-primary font-body-sm text-body-sm hover:bg-primary-container transition-colors disabled:opacity-40"
            >
              {busy === key ? '儲存中…' : isNew ? '新增族群' : '儲存'}
            </button>
            {!isNew && (
              <>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? '' : draft.id)}
                  disabled={draft.symbols.length === 0}
                  className="px-3 py-1.5 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors disabled:opacity-40"
                >
                  {isOpen ? '收合明細' : '看營收與漲跌'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(draft)}
                  disabled={busy !== ''}
                  className="px-3 py-1.5 bg-surface border border-outline-variant rounded text-error font-body-sm text-body-sm hover:bg-surface-container-low transition-colors disabled:opacity-40"
                >
                  刪除
                </button>
              </>
            )}
          </span>
        </div>

        {renaming && (
          <p className="font-body-sm text-body-sm text-error">
            名稱就是後端的鍵，改名會<span className="font-semibold">另外建一個族群</span>
            （原本的「{saved?.name}」還會留著，要自己刪）。只是想改成員的話，把名稱改回去。
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
            成員（{draft.symbols.length} 檔，順序就是顯示順序）
          </span>

          {draft.symbols.length === 0 ? (
            <p className="font-body-sm text-body-sm text-outline">
              還沒有成員。用下面的搜尋框一檔一檔加，或直接把一整串代號貼進去。
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {draft.symbols.map((symbol, index) => (
                <MemberChip
                  key={symbol}
                  symbol={symbol}
                  name={names[symbol] ?? ''}
                  first={index === 0}
                  last={index === draft.symbols.length - 1}
                  onMove={(delta) => moveSymbol(index, delta)}
                  onRemove={() => removeSymbol(symbol)}
                />
              ))}
            </div>
          )}

          <MemberInput
            exclude={draft.symbols}
            options={holdings.data ?? []}
            onAdd={addSymbols}
          />
        </div>

        {isOpen && (
          <div className="flex flex-col gap-stack-sm border-t border-outline-variant pt-3">
            {dirty && (
              <p className="font-body-sm text-body-sm text-error">
                下面列的是<span className="font-semibold">已儲存</span>
                的成員。剛剛加減的還沒送出，按「儲存」之後才會反映。
              </p>
            )}
            {peers.loading && <PageState kind="loading" message="查成員資料中…" />}
            {peers.error && <PageState kind="error" message={peers.error} onRetry={peers.reload} />}
            {!peers.loading && !peers.error && !detail && (
              <PageState
                kind="empty"
                message="查不到這個族群的成員資料"
                hint="剛新增或剛改過成員時會這樣，按上面的「儲存」再重新展開一次。"
              />
            )}
            {detail && <MemberTable month={detail.month} peers={detail.peers} />}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-stack-md">
      <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px]">edit_note</span>
        族群維護
        {notice && <span className="font-body-sm text-body-sm text-primary">{notice}</span>}
      </h3>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        <span className="text-on-surface font-semibold">成員不必在自選股裡</span>
        ——台勝科不在清單也該出現在矽晶圓族群，搜尋框裡打代號按 Enter 就能加。這種成員只比得了
        月營收（那是唯一涵蓋全市場的數字，1,900 多家），收盤價、法人、融資券只收自選股，
        展開明細後會標「非自選股」。
        <span className="text-on-surface font-semibold">一檔可以屬於多個族群</span>
        ，中美晶同時是矽晶圓與太陽能，加進兩個族群就好。
        成員的順序會照原樣存下來，龍頭想擺第一個就用箭頭挪。
      </p>

      {members.data != null && members.data.unnamed > 0 && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          有 {members.data.unnamed} 檔<span className="text-on-surface font-semibold">查不到名稱</span>
          ，chip 上只會顯示代號。名稱取自月營收那份資料（唯一涵蓋全市場的，1,900 多家），
          所以查不到多半是<span className="text-on-surface font-semibold">代號打錯</span>
          ，也可能是 ETF 或剛上市還沒公告過營收。
        </p>
      )}

      {members.loading && <PageState kind="loading" />}
      {members.error && (
        <PageState kind="error" message={members.error} onRetry={members.reload} />
      )}

      {!members.loading && !members.error && (
        <>
          {drafts.length === 0 && (
            <PageState
              kind="empty"
              message="還沒建過任何族群"
              hint="空的很正常，這一份完全靠自己維護。從下面那張卡開始，例如名稱填「散熱」，再把 3324、8996、3017 加進去。"
            />
          )}
          {drafts.map((draft) => renderCard(draft, false))}
          {renderCard(creating, true)}
        </>
      )}
    </div>
  );
}

/** 一個成員。名稱查不到時只顯示代號——那多半代表代號打錯，或 MIS 收盤後掛了。 */
function MemberChip({
  symbol,
  name,
  first,
  last,
  onMove,
  onRemove,
}: {
  symbol: string;
  name: string;
  first: boolean;
  last: boolean;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const arrowClass =
    'p-0.5 rounded text-outline hover:text-primary hover:bg-surface-container transition-colors disabled:opacity-30 disabled:hover:text-outline disabled:hover:bg-transparent';

  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-lg bg-surface-container-low border border-outline-variant">
      <span className="font-data-md text-data-md text-on-surface">{symbol}</span>
      <span className="font-body-sm text-body-sm text-on-surface-variant max-w-[8rem] truncate">
        {name || '查不到名稱'}
      </span>
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={first}
        title="往前挪"
        className={arrowClass}
      >
        <span className="material-symbols-outlined text-[16px]">chevron_left</span>
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={last}
        title="往後挪"
        className={arrowClass}
      >
        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        title={`移除 ${symbol}`}
        className="p-0.5 rounded text-outline hover:text-error hover:bg-surface-container transition-colors"
      >
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </span>
  );
}

/**
 * 加成員：從自選股挑，或直接打代號。
 *
 * 兩種並存的理由同 SymbolPicker：清單裡的用選的（有名稱可以確認），
 * 不在清單裡的直接打——族群正是拿來找還沒買的同類股的，只讓選自選股等於做不了事。
 */
function MemberInput({
  exclude,
  options,
  onAdd,
}: {
  exclude: string[];
  options: Holding[];
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);

  const keyword = text.trim().toLowerCase();
  // 代號與名稱都能比對：記得「聯發科」但想不起 2454 的情況比想像中常見。
  const matches = options
    .filter((row) => !exclude.includes(row.symbol))
    .filter(
      (row) =>
        !keyword ||
        row.symbol.toLowerCase().includes(keyword) ||
        row.name.toLowerCase().includes(keyword)
    )
    .slice(0, 6);

  const commit = (value: string) => {
    if (!value.trim()) return;
    onAdd(value);
    setText('');
    setOpen(false);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-stack-sm">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
            search
          </span>
          <input
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            // 失焦要晚一點關，否則點下拉那一列時會先關掉、點不到。
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit(text);
              }
              if (event.key === 'Escape') setOpen(false);
            }}
            placeholder="加成員：打代號或名稱，也可以貼一整串"
            className={`${inputClass} w-72 pl-8 font-data-md text-data-md`}
          />
        </div>
        <button
          type="button"
          onClick={() => commit(text)}
          disabled={!text.trim()}
          className="px-3 py-1.5 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors disabled:opacity-40"
        >
          加入
        </button>
      </div>

      {open && matches.length > 0 && (
        <ul className="absolute left-0 top-full mt-1 z-40 w-72 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-lg overflow-hidden">
          <li className="px-3 py-2 font-label-caps text-label-caps uppercase text-on-surface-variant bg-surface-container-low border-b border-outline-variant">
            自選股
          </li>
          {matches.map((row) => (
            <li key={row.symbol}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit(row.symbol)}
                className="w-full flex items-baseline gap-2 px-3 py-2 text-left hover:bg-surface-container-low transition-colors"
              >
                <span className="font-data-md text-data-md text-primary font-bold">
                  {row.symbol}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                  {row.name}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 展開後的成員明細。這張表的重點是「代號有沒有打錯」與「這群人現在誰在動」。 */
function MemberTable({ month, peers }: { month: string; peers: GroupPeer[] }) {
  return (
    <div className="flex flex-col gap-stack-sm">
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        營收月份 {month || DASH}
        ，單月營收單位新台幣千元（畫面已換算成億／萬元）。
        <span className="text-on-surface font-semibold">名稱與產業是破折號代表查無這個代號</span>
        ——多半是打錯，或那一檔還沒公告過任何月營收。 近五日漲跌幅是滾動 5 個交易日，來源是
        Yahoo 日 K（跟其他頁的收盤可能差約 20 分鐘）， 破折號是「這次沒取到」不是持平。
      </p>

      <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
        <table className="w-full border-collapse">
          <thead className="bg-surface-container-low border-b border-outline-variant">
            <tr>
              <th className={`${headCell} pl-4 text-left`}>代號</th>
              <th className={`${headCell} text-left`}>名稱</th>
              <th className={`${headCell} text-left`}>官方產業</th>
              <th className={`${headCell} text-right`}>單月營收</th>
              <th className={`${headCell} text-right`}>年增率</th>
              <th className={`${headCell} text-right`}>月增率</th>
              <th className={`${headCell} pr-4 text-right`}>近五日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50">
            {peers.map((peer) => (
              <tr key={peer.symbol} className="hover:bg-surface-container-low/50 transition-colors">
                <td className="p-2 py-3 pl-4 font-data-md text-data-md text-on-surface">
                  {peer.symbol}
                </td>
                <td className="p-2 py-3 font-body-md text-body-md text-on-surface">
                  {peer.name || <span className="text-error">{DASH}</span>}
                  {peer.name && !peer.in_watchlist && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-surface-container font-body-sm text-body-sm text-on-surface-variant">
                      非自選股
                    </span>
                  )}
                </td>
                <td className="p-2 py-3 font-body-sm text-body-sm text-on-surface-variant">
                  {peer.industry || DASH}
                </td>
                <td className={`${numCell} text-on-surface`}>{formatThousandTWD(peer.revenue)}</td>
                {/* revenue 是 null 時年增／月增沒有意義，整列一起顯示破折號。 */}
                <td className={`${numCell} ${peer.revenue == null ? '' : quoteColor(peer.yoy)}`}>
                  {peer.revenue == null ? DASH : formatSignedPercent(peer.yoy)}
                </td>
                <td className={`${numCell} ${peer.revenue == null ? '' : quoteColor(peer.mom)}`}>
                  {peer.revenue == null ? DASH : formatSignedPercent(peer.mom)}
                </td>
                <td className={`${numCell} pr-4 ${quoteColor(peer.week_change)}`}>
                  {formatSignedPercent(peer.week_change)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 熱度榜的一列加上名次與「是被哪幾檔命中的」。沒在搜尋時 hits 一律是空的。 */
interface HeatRow {
  item: GroupHeat;
  // 在**整份榜**上的名次，1 起算。搜尋過濾之後不重編——重編的話「第 1 名」
  // 會變成「符合搜尋條件的裡面最前面那個」，那跟熱度完全無關。
  rank: number;
  hits: GroupMember[];
}

/**
 * 每日題材熱度榜。
 *
 * ⚠️ 這是現況描述不是預測：四個訊號講的都是「已經發生了什麼」，沒有任何一項檢定過
 * 「之後會不會漲」。後端回的 caveats 原樣列在表下方，不要在改版時拿掉。
 */
function HeatBoard() {
  // 不輪詢：這一支要當天的全市場橫斷面才算得出來，一天只會變一次。
  const heat = useAsyncData(() => getGroupHeat(), []);
  const board = heat.data;

  // 搜尋要比對的是完整成員名單，而熱度榜只回族群層級的數字與最多三檔領漲，所以另外拿一份。
  // 這一支不打上游（只讀族群表、月營收與自選股三張表），跟熱度榜本身比成本可以忽略。
  // 它掛掉不擋熱度榜：搜尋會退化成只比對族群名稱與領漲那幾檔，下面的提示會講明。
  const members = useAsyncData(() => getGroupMembers(), []);

  const [query, setQuery] = useState('');
  // 一次只展開一個族群。展開的內容是整群的逐檔，同時攤開十幾群的話這張表會長到
  // 捲不完，而且「我現在在看哪一群」會消失——那正是點開的人想確認的事。
  const [openGroup, setOpenGroup] = useState('');

  // 後端沒有「這份榜是幾點算出來的」欄位，as_of 只到日期。
  // 這裡記的是**畫面上這份是幾點抓回來的**，兩者語意不同所以分成兩個標籤顯示：
  // 只寫一個「更新時間」會讓人以為按了重新整理就會拿到更新的收盤資料。
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (board) setFetchedAt(new Date());
  }, [board]);

  // 上市與上櫃的資料日期常常差一天（上市那包的上游慢一天），兩個都列出來，
  // 不要挑一個當「今天」。
  const asOf = Object.entries(board?.as_of ?? {}).map(([market, date]) => ({
    label: market === 'twse' ? '上市' : market === 'tpex' ? '上櫃' : market,
    date,
  }));

  // 族群名稱→成員。熱度榜與成員清單只能靠名稱對起來（熱度那一支不回 id），
  // 名稱本來就是後端的鍵（同名視為覆蓋），所以對得起來。
  const memberIndex = useMemo(() => {
    const index: Record<string, GroupMember[]> = {};
    for (const entry of members.data?.items ?? []) index[entry.group.name] = entry.members;
    return index;
  }, [members.data]);

  const keyword = query.trim().toLowerCase();

  // 成員清單那一支目前要跑三十幾秒（後端對每個代號各查一次月營收，958 檔就是 958 趟），
  // 在它回來之前搜尋只比對得到領漲那三檔。
  //
  // ⚠️ 這段期間絕對不能說「沒有族群含這一檔」：多數檔本來就不是領漲，那句話會把
  // 「還沒載完」講成「你沒把它歸類」，而那是完全相反的結論——實測搜「環球晶」
  // （已經在矽晶圓與磊晶群裡）就會撞到。
  const rosterPending = members.loading || (!members.data && !members.error);

  // 搜尋的涵蓋範圍：族群成員去重之後的檔數。
  //
  // 這個數字一定要寫在畫面上。族群是人工維護的，成員合起來大約只有全市場的一半，
  // 沒被歸類的那一半（例如晶圓代工那幾檔）搜起來一樣是「沒有結果」，
  // 跟「這一檔今天沒在動」長得一模一樣——不標的話會被當成資料漏了。
  const coveredSymbols = useMemo(() => {
    const symbols = new Set<string>();
    for (const roster of Object.values(memberIndex)) {
      for (const member of roster) symbols.add(member.symbol);
    }
    return symbols.size;
  }, [memberIndex]);

  // 比對範圍是**族群成員**而不是領漲那三檔：領漲只列今天漲最多的前三名，
  // 拿它當搜尋範圍的話「我手上這檔今天在哪一群裡」多數時候會查不到，
  // 而那正是這個搜尋要回答的問題。族群名稱也一起比，打「散熱」要找得到。
  const rows: HeatRow[] = useMemo(() => {
    // 名次直接用後端回的順序，前端不重排：排序鍵是三層（樣本足夠優先 → 訊號數 →
    // 超額報酬），只看回應裡的欄位重算會漏掉第一層，而那一層正是用來擋掉
    // 「兩檔的族群因為其中一檔漲停就登頂」的。
    const items = (board?.items ?? []).map((item, index) => ({ item, rank: index + 1 }));
    if (!keyword) return items.map((entry) => ({ ...entry, hits: [] }));

    const result: HeatRow[] = [];
    for (const { item, rank } of items) {
      const roster = memberIndex[item.name];
      // 成員清單還沒回來（或那一支掛了）時退到領漲，至少不是完全搜不到。
      const pool: GroupMember[] =
        roster ??
        item.leaders.map((leader) => ({
          symbol: leader.symbol,
          name: leader.name,
          industry: '',
          in_watchlist: false,
        }));
      const hits = pool.filter(
        (member) =>
          member.symbol.toLowerCase().includes(keyword) ||
          (!!member.name && member.name.toLowerCase().includes(keyword))
      );
      if (hits.length > 0 || item.name.toLowerCase().includes(keyword)) {
        result.push({ item, rank, hits });
      }
    }
    return result;
  }, [board, keyword, memberIndex]);

  return (
    <div className="flex flex-col gap-stack-md">
      <div className="flex flex-wrap items-center gap-stack-sm">
        <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
          今日族群熱度
        </h3>

        {/* 資料日期與載入時間擺在標題旁邊而不是說明文字裡：這一頁一天只變一次，
            「我看到的是不是今天的」是每次進來第一個要回答的問題。 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {asOf.map((entry) => (
            <span
              key={entry.label}
              className="px-2 py-0.5 rounded bg-surface-container border border-outline-variant font-body-sm text-body-sm text-on-surface-variant"
            >
              {entry.label}資料日期{' '}
              <span className="font-data-md text-data-md text-on-surface">{entry.date}</span>
            </span>
          ))}
          {fetchedAt && (
            <span className="font-body-sm text-body-sm text-outline">
              載入時間{' '}
              <span className="font-data-md text-data-md">
                {fetchedAt.toLocaleTimeString('zh-TW', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })}
              </span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={heat.reload}
          className="ml-auto px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
        >
          重新整理
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-stack-sm">
        <label className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
            search
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="股號或名稱，例如 3324、雙鴻"
            className={`${inputClass} w-64`}
          />
        </label>
        {keyword && (
          <>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {rows.length} / {board?.items.length ?? 0} 個族群含這一檔
            </span>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="font-body-sm text-body-sm text-primary hover:underline"
            >
              清除
            </button>
          </>
        )}
        {/* 成員清單沒回來時搜尋範圍只剩領漲三檔，這件事一定要講，否則使用者會把
            「搜不到」讀成「這一檔不在任何族群裡」。 */}
        {rosterPending && (
          <span className="font-body-sm text-body-sm text-on-surface-variant">
            成員清單載入中（約 30 秒），現在只搜得到表上的領漲三檔
          </span>
        )}
        {!rosterPending && Object.keys(memberIndex).length === 0 && (
          <span className="font-body-sm text-body-sm text-error">
            成員清單沒載入成功，目前只搜得到領漲那幾檔
          </span>
        )}
      </div>

      {rosterPending && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          搜尋範圍還在載入。族群成員清單跟熱度榜是兩支端點，熱度榜一秒多就回來了，
          成員清單要三十幾秒——載完之前搜尋只比對得到表上的領漲三檔，
          <span className="text-on-surface">搜不到不代表那一檔不在族群裡</span>。
        </p>
      )}

      {coveredSymbols > 0 && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          搜尋範圍是{' '}
          <span className="font-data-md text-data-md text-on-surface">
            {formatNumber(Object.keys(memberIndex).length)}
          </span>{' '}
          個族群、去重後{' '}
          <span className="font-data-md text-data-md text-on-surface">
            {formatNumber(coveredSymbols)}
          </span>{' '}
          檔
          {board != null && (
            <>
              ，全市場今天有{' '}
              <span className="font-data-md text-data-md text-on-surface">
                {formatNumber(board.market.counted)}
              </span>{' '}
              檔算進基準
            </>
          )}
          。<span className="text-on-surface">族群是人工歸類的，沒被歸進去的檔搜不到</span>
          ——那不是資料漏收，是還沒有人把它放進任何一群，到「族群維護」加進去就會出現。
        </p>
      )}

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        <span className="text-error font-semibold">這是今天的現況描述，不是預測。</span>
        訊號數是四個獨立條件的計數，不是加權分數——沒做過樣本外檢定的權重會長得像有依據，其實沒有。
        族群內一律用中位數不用平均（一檔漲停就能把平均拉起來），指標一律用比率不用絕對金額。
        　名次是後端這份榜的順序：<span className="text-on-surface">涵蓋 3 檔以上的優先</span>，
        其次訊號數，平手才看超額報酬。所以名次高不等於漲得多，而是「今天最像整群在動」；
        標了樣本過少的一律排在後段，那個名次講的是不可信不是比較弱。搜尋過濾不會重編名次。
        　「領漲」只列漲最多的三檔，要看整群逐檔的漲跌就按族群名稱底下的
        <span className="text-on-surface">展開全部</span>。
        {board != null && <>　用到 {board.days_covered} 個交易日。</>}
        　搜尋比對的是族群名稱與<span className="text-on-surface">全部成員</span>的股號、名稱，
        不只表上的領漲三檔。
      </p>

      {heat.loading && <PageState kind="loading" />}
      {heat.error && <PageState kind="error" message={heat.error} onRetry={heat.reload} />}

      {!heat.loading && !heat.error && board && board.items.length === 0 && (
        <PageState
          kind="empty"
          message="還沒有今天的橫斷面資料"
          hint="這一支要當天的全市場收盤才算得出來，盤中或收集還沒跑完時會是空的。也可能是還沒建過任何族群——先在上面建一個。"
        />
      )}

      {/* 搜不到跟「今天沒有橫斷面」是兩件事，訊息要分開：前者只代表這一檔不在任何族群裡。 */}
      {!heat.loading && !heat.error && !rosterPending && board && board.items.length > 0 && rows.length === 0 && (
        <PageState
          kind="empty"
          message={`沒有族群含「${query.trim()}」`}
          hint={`族群是人工維護的，目前只涵蓋 ${formatNumber(coveredSymbols)} 檔。這一檔還沒被歸到任何一群——到「族群維護」把它加進去，這裡就會出現。也可能是股號或名稱打錯了。`}
        />
      )}

      {board && rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className={`${headCell} pl-4 text-right`}>名次</th>
                  <th className={`${headCell} text-left`}>族群</th>
                  <th className={`${headCell} text-left`}>成立訊號</th>
                  <th className={`${headCell} text-right`}>中位數報酬</th>
                  <th className={`${headCell} text-right`}>超額報酬</th>
                  <th className={`${headCell} text-right`}>上漲家數比</th>
                  <th className={`${headCell} text-right`}>成交值</th>
                  <th className={`${headCell} text-right`}>占大盤</th>
                  <th className={`${headCell} text-right`}>占比變化</th>
                  <th className={`${headCell} text-right`}>單筆／市場</th>
                  <th className={`${headCell} pr-4 text-left`}>領漲前 3</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {rows.map(({ item, rank, hits }) => {
                  const open = openGroup === item.name;
                  return (
                    <Fragment key={item.name}>
                  <tr className="hover:bg-surface-container-low/50 transition-colors align-top">
                    {/* 樣本過少的一律被排到後段，那個名次講的是「不可信」而不是「比較弱」，
                        所以用淡色，跟前段班的名次區分開。 */}
                    <td
                      className={`${numCell} pl-4 ${item.thin ? 'text-outline' : 'text-on-surface'}`}
                    >
                      {rank}
                    </td>
                    <td className="p-2 py-3">
                      <span className="font-body-md text-body-md text-on-surface font-semibold">
                        {item.name}
                      </span>
                      <span className="block font-body-sm text-body-sm text-on-surface-variant">
                        {item.covered_count}/{item.member_count} 檔算得出報酬
                      </span>
                      {/* 涵蓋不到三檔時中位數幾乎由單一檔決定，那多半是個股事件不是題材。 */}
                      {item.thin && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-error/10 font-body-sm text-body-sm text-error">
                          樣本過少
                        </span>
                      )}
                      {/* 命中的那一檔多半不在領漲欄裡，不標的話這一列看起來像沒理由被留下。 */}
                      {hits.length > 0 && (
                        <span className="block mt-1 font-body-sm text-body-sm text-primary">
                          命中{' '}
                          {hits
                            .map((hit) => (hit.name ? `${hit.symbol} ${hit.name}` : hit.symbol))
                            .join('、')}
                        </span>
                      )}
                      {item.members.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setOpenGroup(open ? '' : item.name)}
                          className="mt-1 inline-flex items-center gap-1 font-body-sm text-body-sm text-primary hover:underline"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {open ? 'expand_less' : 'expand_more'}
                          </span>
                          {open ? '收合' : `展開全部 ${item.members.length} 檔`}
                        </button>
                      )}
                    </td>
                    <td className="p-2 py-3">
                      {item.signal_labels.length === 0 ? (
                        <span className="font-body-sm text-body-sm text-outline">{DASH}</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {item.signal_labels.map((label) => (
                            <span
                              key={label}
                              className="px-1.5 py-0.5 rounded bg-surface-container border border-outline-variant font-body-sm text-body-sm text-on-surface whitespace-nowrap"
                            >
                              {label}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className={`${numCell} ${quoteColor(item.median_return)}`}>
                      {formatSignedPercent(item.median_return)}
                    </td>
                    <td className={`${numCell} ${quoteColor(item.excess_return)}`}>
                      {formatSignedPercent(item.excess_return)}
                    </td>
                    <td className={`${numCell} text-on-surface`}>
                      {formatPercent(item.advance_ratio)}
                    </td>
                    <td className={`${numCell} text-on-surface`}>
                      {formatAmount(item.trade_value)}
                    </td>
                    <td className={`${numCell} text-on-surface`}>
                      {formatPercent(item.share_of_market)}
                    </td>
                    {/* null 是「還沒有前一天的資料」，不是「沒有變化」，所以不補 0。 */}
                    <td className={`${numCell} ${quoteColor(item.share_change)}`}>
                      {item.share_change == null ? DASH : formatSigned(item.share_change)}
                    </td>
                    <td className={`${numCell} text-on-surface`}>
                      {formatNumber(item.avg_trade_size_ratio, 2)} 倍
                    </td>
                    <td className="p-2 py-3 pr-4">
                      {item.leaders.length === 0 ? (
                        <span className="font-body-sm text-body-sm text-outline">{DASH}</span>
                      ) : (
                        <span className="flex flex-col gap-0.5">
                          {item.leaders.map((leader) => (
                            <span
                              key={leader.symbol}
                              className="font-data-md text-data-md whitespace-nowrap"
                            >
                              <span className="text-on-surface-variant">{leader.symbol}</span>{' '}
                              <span className="font-body-sm text-body-sm text-on-surface">
                                {leader.name}
                              </span>{' '}
                              <span className={quoteColor(leader.return_pct)}>
                                {formatSignedPercent(leader.return_pct)}
                              </span>
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>

                  {open && (
                    <tr className="bg-surface-container-low/40">
                      <td colSpan={11} className="p-4">
                        <div className="flex flex-col gap-stack-sm">
                          <p className="font-body-sm text-body-sm text-on-surface-variant">
                            <span className="text-on-surface font-semibold">{item.name}</span>
                            　今天算得出報酬的 {item.members.length} 檔，報酬由高到低。
                            {/* 算不出報酬的那幾檔不在這份裡，不說明的話會被讀成
                                「這個族群只有這幾檔」。 */}
                            {item.member_count > item.members.length && (
                              <>
                                　另外 {item.member_count - item.members.length}{' '}
                                檔今天算不出報酬（當天沒成交、除權息當天，或不是普通股），
                                完整名單在「族群維護」那一頁。
                              </>
                            )}
                          </p>
                          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                            {item.members.map((member) => {
                              const matched =
                                !!keyword &&
                                (member.symbol.toLowerCase().includes(keyword) ||
                                  member.name.toLowerCase().includes(keyword));
                              return (
                                <div
                                  key={member.symbol}
                                  className={`flex items-baseline gap-2 rounded border px-2 py-1.5 ${
                                    matched
                                      ? 'border-primary bg-primary/10'
                                      : 'border-outline-variant bg-surface-container-lowest'
                                  }`}
                                >
                                  <span className="font-data-md text-data-md text-on-surface-variant">
                                    {member.symbol}
                                  </span>
                                  <span className="font-body-sm text-body-sm text-on-surface">
                                    {member.name}
                                  </span>
                                  <span
                                    className={`ml-auto font-data-md text-data-md ${quoteColor(
                                      member.return_pct
                                    )}`}
                                  >
                                    {formatSignedPercent(member.return_pct)}
                                  </span>
                                  <span className="font-data-md text-data-md text-outline">
                                    {formatAmount(member.trade_value)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="font-body-sm text-body-sm text-on-surface-variant">
            全市場基準：中位數報酬 {formatSignedPercent(board.market.median_return)}、成交值{' '}
            {formatAmount(board.market.trade_value)}、平均單筆{' '}
            {formatAmount(board.market.avg_trade_size)}，算進基準的有{' '}
            {formatNumber(board.market.counted)} 檔。族群的超額報酬與「單筆／市場」都是跟這一組比出來的。
          </p>

          <div className="rounded-xl border border-outline-variant bg-surface-container-low/40 p-4 flex flex-col gap-stack-sm">
            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              讀這份榜之前
            </p>
            <ul className="flex flex-col gap-1 font-body-sm text-body-sm text-on-surface-variant list-disc pl-5">
              {board.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
            <p className="font-body-sm text-body-sm text-outline">{board.method}</p>
          </div>
        </>
      )}
    </div>
  );
}
