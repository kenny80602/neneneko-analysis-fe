// 頁尾。四個政策連結目前都沒有對應頁面，先指向 # 佔位——
// 有內容之後換成 <Link>，不要留著假連結上線。
const links = ['隱私權政策', '服務條款', '監管聲明', '聯絡客服'];

export default function AppFooter() {
  return (
    <footer className="bg-transparent w-full py-6 flex flex-col md:flex-row justify-between items-center gap-stack-md mt-auto">
      <div className="font-display text-body-lg font-bold text-primary hidden md:block">
        精準資本
      </div>

      <div className="flex flex-wrap justify-center gap-4 text-center">
        {links.map((label) => (
          <a
            key={label}
            href="#/"
            className="text-on-surface-variant font-body-sm text-body-sm hover:underline hover:text-primary transition-all"
          >
            {label}
          </a>
        ))}
      </div>

      <div className="font-body-sm text-body-sm text-on-surface-variant text-center md:text-right w-full md:w-auto">
        © {new Date().getFullYear()} 精準資本。版權所有。高風險金融數據不提供任何擔保。
      </div>
    </footer>
  );
}
