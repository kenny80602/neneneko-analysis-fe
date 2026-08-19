import { useEffect, useState } from 'react';
import PageHeader from '../components/PageHeader';
import PageState from '../components/PageState';
import { getGroupHeat } from '../api/groupHeat';
import { apiErrorMessage } from '../api/request';
import {
  getGroupPeers,
  getStockGroups,
  removeStockGroup,
  saveStockGroup,
} from '../api/stockGroup';
import { GroupPeer, StockGroup } from '../api/types';
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

export default function StockGroups() {
  return (
    <>
      <PageHeader
        title="主題族群"
        icon="workspaces"
        subtitle="自己歸類的題材族群，以及各族群今天的資金與擴散度"
      />

      <div className="flex flex-col gap-stack-lg">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          族群是人工維護的，<span className="text-on-surface font-semibold">官方產業別做不到</span>
          ：矽晶圓的中美晶、環球晶、台勝科官方全歸「半導體業」（一百多家，台積電也在裡面）；
          散熱的雙鴻、高力、奇鋐則分屬其他電子業、電機機械、電腦及週邊設備業，
          官方分類永遠不會把它們放在一起。個股總覽的「主題族群」區塊與下方的熱度榜都吃這裡的設定。
          破折號一律代表「沒有這個數字」而不是 0。
        </p>

        <GroupPanel />
        <HeatBoard />
      </div>
    </>
  );
}

/** 族群編輯中的原始字串。代號用一格文字輸入而不是逐個 chip：貼一整串是最常見的用法。 */
interface GroupDraft {
  // 伺服器上的 id。空字串代表「還沒建的新族群」那一列。
  id: string;
  name: string;
  symbolText: string;
  sortOrder: string;
}

const NEW_GROUP: GroupDraft = { id: '', name: '', symbolText: '', sortOrder: '' };

function toGroupDraft(group: StockGroup): GroupDraft {
  return {
    id: group.id,
    name: group.name,
    symbolText: group.symbols.join(' '),
    sortOrder: String(group.sort_order),
  };
}

/** 逗號、頓號、空白、換行都當分隔——貼上來的東西什麼格式都有。 */
function parseSymbols(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,，、;；]+/)) {
    const symbol = raw.trim().toUpperCase();
    // 這裡不排序：使用者可能刻意把龍頭放第一個，後端也照原順序存。
    if (symbol) seen.add(symbol);
  }
  return Array.from(seen);
}

/**
 * 族群的維護介面：新增、改成員、改排序、刪除，並可展開看成員到底是哪幾家公司。
 */
function GroupPanel() {
  const groups = useAsyncData(() => getStockGroups(), []);
  const [drafts, setDrafts] = useState<GroupDraft[]>([]);
  const [creating, setCreating] = useState<GroupDraft>(NEW_GROUP);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  // 一次只展開一個族群。成員明細那一支會逐檔去問 Yahoo 的日 K（週漲跌幅那一欄），
  // 全部展開等於一次打好幾十檔，上游會回 429。
  const [openId, setOpenId] = useState('');

  // 存檔後重抓，本地編輯一律以伺服器為準蓋回去。族群沒有「未儲存草稿」的需求，
  // 留著反而會出現「畫面上有但其實沒存到」。
  useEffect(() => {
    if (groups.data) setDrafts(groups.data.map(toGroupDraft));
  }, [groups.data]);

  // 成員明細只問一檔：peers 那一支回的是「這一檔所屬的每一個族群，各自帶完整成員」，
  // 所以拿族群的第一個成員去問，就會拿回整個族群的名單，不必逐檔打。
  //
  // 用伺服器上的成員而不是編輯中的草稿：草稿每打一個字都會變，那會變成邊打字邊打上游。
  const openGroup = groups.data?.find((g) => g.id === openId);
  const seed = openGroup?.symbols[0] ?? '';
  const peers = useAsyncData(() => getGroupPeers(seed), [seed], { enabled: !!seed });
  const detail = peers.data?.find((entry) => entry.group.id === openId);

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
        symbols: parseSymbols(draft.symbolText),
        sort_order: draft.sortOrder === '' ? 0 : Math.trunc(order),
      });
      if (isNew) setCreating(NEW_GROUP);
      groups.reload();
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
      groups.reload();
      setNotice(`已刪掉「${draft.name}」`);
    } catch (err) {
      setNotice(apiErrorMessage(err));
    } finally {
      setBusy('');
    }
  };

  /** 一個族群的編輯卡。新增用的那張除了按鈕文案與展開區之外長得一樣。 */
  const renderCard = (draft: GroupDraft, isNew: boolean) => {
    const symbols = parseSymbols(draft.symbolText);
    const key = isNew ? '__new__' : draft.id;
    const isOpen = !isNew && openId === draft.id;
    // 存檔前後的成員可能不一樣，展開區顯示的一律是伺服器上的那一份。
    const saved = groups.data?.find((g) => g.id === draft.id);
    const dirty = !isNew && saved != null && saved.symbols.join(' ') !== symbols.join(' ');
    const update = (next: Partial<GroupDraft>) =>
      isNew ? setCreating((prev) => ({ ...prev, ...next })) : patch(draft.id, next);

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
          <label className="flex flex-col gap-1 flex-1 min-w-[16rem]">
            <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
              成員代號
            </span>
            <input
              value={draft.symbolText}
              onChange={(event) => update({ symbolText: event.target.value })}
              placeholder="3324 8996 3017"
              className={`${inputClass} w-full font-data-md text-data-md`}
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
              className={`${inputClass} w-20 font-data-md text-data-md text-right`}
            />
          </label>
          <span className="inline-flex gap-2 pb-0.5">
            <button
              type="button"
              onClick={() => save(draft, isNew)}
              disabled={busy !== ''}
              className="px-3 py-1.5 bg-primary rounded text-on-primary font-body-sm text-body-sm hover:bg-primary-container transition-colors disabled:opacity-40"
            >
              {busy === key ? '儲存中…' : isNew ? '新增' : '儲存'}
            </button>
            {!isNew && (
              <>
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? '' : draft.id)}
                  disabled={symbols.length === 0}
                  className="px-3 py-1.5 bg-surface border border-outline-variant rounded text-primary font-body-sm text-body-sm hover:bg-surface-container-low transition-colors disabled:opacity-40"
                >
                  {isOpen ? '收合成員' : '看成員'}
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

        {/* 把解析結果攤開，才知道貼進去那一串真的被拆成幾檔。 */}
        <p className="font-body-sm text-body-sm text-on-surface-variant flex flex-wrap items-center gap-1.5">
          {symbols.length === 0 ? (
            <span className="text-outline">
              還沒有成員。逗號、空白、換行都可以當分隔，直接貼一整串進來就行。
            </span>
          ) : (
            <>
              <span>{symbols.length} 檔：</span>
              {symbols.map((symbol) => (
                <span
                  key={symbol}
                  className="px-2 py-0.5 rounded bg-surface-container-low border border-outline-variant font-data-md text-data-md text-on-surface"
                >
                  {symbol}
                </span>
              ))}
            </>
          )}
        </p>

        {isOpen && (
          <div className="flex flex-col gap-stack-sm border-t border-outline-variant pt-3">
            {dirty && (
              <p className="font-body-sm text-body-sm text-error">
                下面列的是<span className="font-semibold">已儲存</span>
                的成員。剛剛改的還沒送出，按「儲存」之後才會反映。
              </p>
            )}
            {peers.loading && <PageState kind="loading" message="查成員資料中…" />}
            {peers.error && (
              <PageState kind="error" message={peers.error} onRetry={peers.reload} />
            )}
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
        ——台勝科不在清單也該出現在矽晶圓族群。這種成員只比得了月營收（那是唯一涵蓋全市場的數字，
        1,900 多家），收盤價、法人、融資券只收自選股，展開後會標「非自選股」。
        <span className="text-on-surface font-semibold">一檔可以屬於多個族群</span>
        ，中美晶同時是矽晶圓與太陽能，直接把它加進兩個族群就好。 排序小的排前面。名稱就是鍵，
        <span className="text-on-surface">改名等於另外建一個</span>，舊的要自己刪掉。
      </p>

      {groups.loading && <PageState kind="loading" />}
      {groups.error && <PageState kind="error" message={groups.error} onRetry={groups.reload} />}

      {!groups.loading && !groups.error && (
        <>
          {drafts.length === 0 && (
            <PageState
              kind="empty"
              message="還沒建過任何族群"
              hint="空的很正常，這一份完全靠自己維護。從下面那張卡開始，例如名稱填「散熱」、成員填 3324 8996 3017。"
            />
          )}
          {drafts.map((draft) => renderCard(draft, false))}
          {renderCard(creating, true)}
        </>
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

  // 上市與上櫃的資料日期常常差一天（上市那包的上游慢一天），兩個都列出來，
  // 不要挑一個當「今天」。
  const asOf = Object.entries(board?.as_of ?? {})
    .map(([market, date]) => `${market === 'twse' ? '上市' : market === 'tpex' ? '上櫃' : market} ${date}`)
    .join('、');

  return (
    <div className="flex flex-col gap-stack-md">
      <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
        <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
        今日族群熱度
        <button
          type="button"
          onClick={heat.reload}
          className="ml-auto px-4 py-2 bg-surface border border-outline-variant rounded text-primary font-body-md text-body-md hover:bg-surface-container-low transition-colors"
        >
          重新整理
        </button>
      </h3>

      <p className="font-body-sm text-body-sm text-on-surface-variant">
        <span className="text-error font-semibold">這是今天的現況描述，不是預測。</span>
        訊號數是四個獨立條件的計數，不是加權分數——沒做過樣本外檢定的權重會長得像有依據，其實沒有。
        族群內一律用中位數不用平均（一檔漲停就能把平均拉起來），指標一律用比率不用絕對金額。
        {asOf && <>　資料日期：{asOf}。</>}
        {board != null && <>　用到 {board.days_covered} 個交易日。</>}
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

      {board && board.items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
            <table className="w-full border-collapse">
              <thead className="bg-surface-container-low border-b border-outline-variant">
                <tr>
                  <th className={`${headCell} pl-4 text-left`}>族群</th>
                  <th className={`${headCell} text-left`}>成立訊號</th>
                  <th className={`${headCell} text-right`}>中位數報酬</th>
                  <th className={`${headCell} text-right`}>超額報酬</th>
                  <th className={`${headCell} text-right`}>上漲家數比</th>
                  <th className={`${headCell} text-right`}>成交值</th>
                  <th className={`${headCell} text-right`}>占大盤</th>
                  <th className={`${headCell} text-right`}>占比變化</th>
                  <th className={`${headCell} text-right`}>單筆／市場</th>
                  <th className={`${headCell} pr-4 text-left`}>領漲</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {board.items.map((item) => (
                  <tr
                    key={item.name}
                    className="hover:bg-surface-container-low/50 transition-colors align-top"
                  >
                    <td className="p-2 py-3 pl-4">
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
                ))}
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
