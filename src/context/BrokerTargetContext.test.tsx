import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrokerTarget } from '../api/types';
import BrokerTargetCell from '../components/BrokerTargetCell';
import { BrokerTargetProvider, summarizeBrokerTargets } from './BrokerTargetContext';
import { getBrokerTargets } from '../api/brokerTarget';

jest.mock('../api/brokerTarget');

const bt = (symbol: string, broker: string, price: number, date: string, verified = false): BrokerTarget => ({
  id: `${symbol}-${broker}-${date}`,
  symbol,
  broker,
  target_price: price,
  report_date: date,
  source_url: 'https://example.com/a',
  note: '',
  verified,
});

describe('summarizeBrokerTargets', () => {
  it('每家券商只留最新一筆', () => {
    const map = summarizeBrokerTargets([
      bt('2330', '高盛', 3000, '2026-07-04'),
      bt('2330', '高盛', 3100, '2026-07-18'),
      bt('2330', '大摩', 2988, '2026-07-18'),
    ]);
    const s = map.get('2330');
    expect(s?.items.map((i) => `${i.broker}${i.target_price}`).sort()).toEqual(['大摩2988', '高盛3100']);
    expect(s?.newestDate).toBe('2026-07-18');
  });

  it('中位數：奇數取中間、偶數取中間兩個的平均，不被天價拉歪', () => {
    const odd = summarizeBrokerTargets([
      bt('A', '甲', 100, '2026-07-01'),
      bt('A', '乙', 120, '2026-07-01'),
      bt('A', '丙', 9999, '2026-07-01'),
    ]);
    expect(odd.get('A')?.median).toBe(120);
    const even = summarizeBrokerTargets([bt('B', '甲', 100, '2026-07-01'), bt('B', '乙', 200, '2026-07-01')]);
    expect(even.get('B')?.median).toBe(150);
  });

  it('沒查到的檔不在 map 裡', () => {
    expect(summarizeBrokerTargets([]).get('2330')).toBeUndefined();
  });
});

describe('BrokerTargetCell', () => {
  it('沒查到顯示破折號；查到顯示中位數與家數，點開看每家並標未驗證', async () => {
    (getBrokerTargets as jest.Mock).mockResolvedValue([
      bt('2330', '高盛', 3100, '2026-07-18'),
      bt('2330', '大摩', 2988, '2026-07-18'),
      bt('2330', '花旗', 3800, '2026-07-18', true),
    ]);
    render(
      <BrokerTargetProvider>
        <BrokerTargetCell symbol="2330" />
        <BrokerTargetCell symbol="9999" />
      </BrokerTargetProvider>
    );
    expect(await screen.findByText(/（3）/)).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('高盛');
    expect(dialog).toHaveTextContent('未經驗證');
    // 花旗是人工確認過的，不標未驗證；其餘兩家標。
    await waitFor(() => expect(dialog.querySelectorAll('td span').length).toBe(2));
    expect(dialog.querySelector('a')?.getAttribute('href')).toBe('https://example.com/a');
  });
});
