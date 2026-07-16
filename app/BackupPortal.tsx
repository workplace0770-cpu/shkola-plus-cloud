"use client";
import { useCallback, useEffect, useState } from "react";
import type { SchoolUser } from "../db/accounts";

type BackupEntry={id:number;fileName:string;rowCount:number;tableCount:number;checksum:string;createdAt:string;createdByName:string};
async function apiError(response:Response){try{return(await response.json()).error||"Не удалось выполнить действие"}catch{return"Не удалось выполнить действие"}}

export default function BackupPortal({profile}:{profile:SchoolUser}){
 const[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState("");
 const[history,setHistory]=useState<BackupEntry[]>([]);
 const loadHistory=useCallback(async()=>{setError("");try{const r=await fetch("/api/admin/backups",{cache:"no-store"});if(!r.ok)throw new Error(await apiError(r));setHistory((await r.json()).history||[])}catch(e){setError(e instanceof Error?e.message:"Не удалось загрузить журнал")}},[]);
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>e.key==="Escape"&&setOpen(false);window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[open]);
 async function download(){setLoading(true);setError("");try{const r=await fetch("/api/admin/backups",{method:"POST"});if(!r.ok)throw new Error(await apiError(r));const blob=await r.blob(),header=r.headers.get("content-disposition")||"",name=header.match(/filename="([^"]+)"/)?.[1]||`uk-school-backup-${Date.now()}.json`,url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);await loadHistory()}catch(e){setError(e instanceof Error?e.message:"Не удалось скачать копию")}finally{setLoading(false)}}
 if(profile.role!=="admin")return null;
 if(!open)return <button className="backup-fab" onClick={()=>{setOpen(true);void loadHistory()}}>🛡 Резервные копии</button>;
 return <div className="backup-backdrop" onMouseDown={()=>setOpen(false)}><section className="backup-modal" onMouseDown={e=>e.stopPropagation()}><button className="backup-close" onClick={()=>setOpen(false)}>×</button>
  <header className="backup-head"><div className="backup-shield">🛡</div><div><span>UK SCHOOL OF TASHKENT · DATA SAFETY</span><h1>Резервные копии</h1><p>Защищённый экспорт данных школы из Cloudflare D1</p></div></header>
  <div className="backup-grid"><article className="backup-create"><span className="backup-label">НОВАЯ КОПИЯ</span><h2>Сохраните данные школы</h2><p>Будут выгружены ученики, классы, оценки, расписание, финансы, чаты и остальные рабочие данные.</p><div className="backup-safe"><b>✓ Безопасный экспорт</b><span>Пароли и активные сессии никогда не включаются</span></div><button onClick={download} disabled={loading}>{loading?"Создаём копию…":"↓ Скачать новую копию"}</button></article>
  <article className="backup-guide"><span className="backup-label">ВАЖНО</span><h3>Как хранить файл</h3><ol><li>Скачайте копию после важных изменений.</li><li>Храните файл в закрытой папке администратора.</li><li>Не отправляйте его в общий чат или ученикам.</li></ol><p>Журнал хранит только сведения об экспорте. Сам файл остаётся у администратора.</p></article></div>
  {error&&<div className="backup-error">⚠ {error}<button onClick={loadHistory}>Повторить</button></div>}
  <section className="backup-history"><div><span className="backup-label">ЖУРНАЛ ЭКСПОРТА</span><h2>Последние резервные копии</h2></div>{!history.length&&!error?<div className="backup-empty">Копии ещё не создавались</div>:<div className="backup-list">{history.map(x=><article key={x.id}><div className="backup-file">JSON</div><div><strong>{x.fileName}</strong><span>{new Date(x.createdAt).toLocaleString("ru-RU")} · {x.createdByName}</span></div><div className="backup-meta"><b>{x.rowCount}</b><span>записей</span></div><div className="backup-meta"><b>{x.tableCount}</b><span>таблиц</span></div><code title={x.checksum}>SHA-256 · {x.checksum.slice(0,10)}…</code></article>)}</div>}</section>
 </section></div>
}
