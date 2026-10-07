import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TargetPriceEditor from './TargetPriceEditor';
import { TargetStore } from '../hooks/useTargets';
import { StockTarget } from '../api/types';

const target = (symbol: string, price: number, note = ''): StockTarget => ({
  symbol,
  target_price: price,
  note,
  updated_at: '',
});

function makeStore(initial: StockTarget[] = []) {
  const map = new Map(initial.map((t) => [t.symbol, t]));
  const store: TargetStore & { save: jest.Mock; clear: jest.Mock } = {
    get: (symbol) => map.get(symbol),
    save: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  return store;
}

describe('TargetPriceEditor', () => {
  it('沒設定時顯示破折號，點一下輸入，Enter 存檔', async () => {
    const store = makeStore();
    render(<TargetPriceEditor symbol="2330" store={store} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByLabelText('2330 的目標價');
    fireEvent.change(input, { target: { value: '1200' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(store.save).toHaveBeenCalledWith('2330', 1200, ''));
  });

  it('已設定時顯示價格，改價時保留備註', async () => {
    const store = makeStore([target('2330', 1000, '前高八成')]);
    render(<TargetPriceEditor symbol="2330" store={store} />);
    expect(screen.getByRole('button')).toHaveTextContent('1,000.00');
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByLabelText('2330 的目標價');
    fireEvent.change(input, { target: { value: '1100' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(store.save).toHaveBeenCalledWith('2330', 1100, '前高八成'));
  });

  it('清空存檔等於刪除', async () => {
    const store = makeStore([target('2330', 1000)]);
    render(<TargetPriceEditor symbol="2330" store={store} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByLabelText('2330 的目標價');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(store.clear).toHaveBeenCalledWith('2330'));
    expect(store.save).not.toHaveBeenCalled();
  });

  it('輸入 0 或非數字會擋下來並顯示錯誤，不呼叫存檔', async () => {
    const store = makeStore();
    render(<TargetPriceEditor symbol="2330" store={store} />);
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByLabelText('2330 的目標價');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('目標價要大於 0')).toBeInTheDocument();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('Esc 取消，不存也不刪', () => {
    const store = makeStore([target('2330', 1000)]);
    render(<TargetPriceEditor symbol="2330" store={store} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.change(screen.getByLabelText('2330 的目標價'), { target: { value: '5' } });
    fireEvent.keyDown(screen.getByLabelText('2330 的目標價'), { key: 'Escape' });
    expect(store.save).not.toHaveBeenCalled();
    expect(store.clear).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveTextContent('1,000.00');
  });
});
