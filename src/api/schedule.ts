import request from './request';
import { ApiResponse, ScheduleList } from './types';

// ScheduleHandler — /schedules，這個專案有哪些排程、幾點跑、在做什麼。
//
// 清單來自後端的 deploy/launchd 樣板目錄，不是另外維護的一份——新增一支排程
// 就會自己出現在這裡，不必記得回來登記。理由同 /reports 的目錄。
//
// ⚠️ 這支回的是「專案定義了哪些排程」加上 launchd 的當下狀態，
// 但只有「上一次」的離開碼、沒有歷史。要看某一次到底做了什麼得去讀後端的
// logs/notify.log，這支刻意不做那件事。
//
// 沒有查詢參數：一共十幾支，分頁跟篩選只是徒增呼叫端的工。
export const getSchedules = () =>
  request.get<ApiResponse<ScheduleList>>('/schedules').then((res) => res.data.data);
