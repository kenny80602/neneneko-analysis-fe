import request from './request';
import { ApiResponse, ReportCatalog } from './types';

// ReportHandler — /reports 與 /docs，後端 repo 的 docs/ 底下那些研究報告。
//
// 這一組跟其他 api 檔不一樣的地方：報告不是資料而是「一整頁做好的 HTML」，
// 前端不 render 它們的內容，只列目錄然後開新分頁。報告各自帶完整的設計系統
// （襯線標題、自己的色票與深色模式），塞進 app 的版面裡只會兩套打架。
//
// 檔案由後端 serve（GET /docs/**，見 reportUrl）。不複製一份到前端 public/：
// 報告放在 private 的後端 repo，前端 repo 是公開的，複製過去等於公開發表。

// 目錄。要登入（走這裡的 axios，帶得了 token）。
export const getReportCatalog = () =>
  request.get<ApiResponse<ReportCatalog>>('/reports').then((res) => res.data.data);
