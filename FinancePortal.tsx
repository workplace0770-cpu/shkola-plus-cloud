"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { SchoolUser } from "../db/accounts";

type FinanceStatus = "pending" | "paid" | "overdue" | "cancelled";
type RecordItem = {
  id:string; type:string; title:string; description?:string|null; amount:number;
  currency:string; status:FinanceStatus; studentId?:number|null; classId?:number|null;
  studentName?:string|null; className?:string|null; dueDate?:string|null;
  paidAt?:string|null; createdAt:string;
};
type Summary = {totalIncome:number;totalExpenses:number;totalPending:number;totalPaid:number;totalOverdue:number;countPending:number;countPaid:number;countOverdue:number};
type Student = {id:number;fullName:string;className:string|null};
type SchoolClass = {id:number;name:string};
type ListPayload = {error?:string;records?:RecordItem[];students?:Student[];classes?:SchoolClass[]};
type SummaryPayload = {error?:string;summary?:Summary};
type ReportSummary = {charged:number;paid:number;pending:number;overdue:number;expenses:number;recordCount:number};
type Debtor = {studentId:number;studentName:string;className?:string|null;debtCount:number;debtAmount:number;oldestDueDate?:string|null};
type ReportPayload = {error?:string;month?:string;summary?:ReportSummary;debtors?:Debtor[];classes?:SchoolClass[]};

const emptySummary:Summary={totalIncome:0,totalExpenses:0,totalPending:0,totalPaid:0,totalOverdue:0,countPending:0,countPaid:0,countOverdue:0};
const emptyReport:ReportSummary={charged:0,paid:0,pending:0,overdue:0,expenses:0,recordCount:0};
const statusNames:Record<FinanceStatus,string>={pending:"Ожидает",paid:"Оплачено",overdue:"Просрочено",cancelled:"Отменено"};
const typeNames:Record<string,string>={income:"Доход",expense:"Расход",fee:"Начисление",event_budget:"Бюджет мероприятия",shop:"Магазин"};
const money=(amount:number)=>new Intl.NumberFormat("ru-RU").format(Number(amount||0))+" ₸";
const showDate=(value?:string|null)=>value?new Date(value).toLocaleDateString("ru-RU"):"—";

async function apiJson<T extends {error?:string}>(response:Response):Promise<T>{
  const text=await response.text();
  let data:T;
  try{data=(text?JSON.parse(text):{}) as T}catch{
    if(response.status===404)throw new Error("Финансовый сервер ещё не опубликован");
    throw new Error("Сервер вернул некорректный ответ");
  }
  if(!response.ok)throw new Error(data.error||"Не удалось выполнить операцию");
  return data;
}

function joinBytes(parts:Uint8Array[]){
  const size=parts.reduce((total,part)=>total+part.length,0);
  const result=new Uint8Array(size);let offset=0;
  for(const part of parts){result.set(part,offset);offset+=part.length}
  return result;
}

function jpegAsPdf(jpeg:Uint8Array,width:number,height:number){
  const encoder=new TextEncoder();
  const pageWidth=595.28,pageHeight=841.89;
  const content=`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`;
  const objects:Uint8Array[]=[
    encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    joinBytes([encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,encoder.encode("\nendstream")]),
    encoder.encode(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`),
  ];
  const parts:Uint8Array[]=[encoder.encode("%PDF-1.4\n%UK-SCHOOL\n")];
  const offsets=[0];let position=parts[0].length;
  objects.forEach((object,index)=>{
    offsets.push(position);
    const bytes=joinBytes([encoder.encode(`${index+1} 0 obj\n`),object,encoder.encode("\nendobj\n")]);
    parts.push(bytes);position+=bytes.length;
  });
  const xref=position;
  const rows=["xref","0 6","0000000000 65535 f ",...offsets.slice(1).map(value=>`${String(value).padStart(10,"0")} 00000 n `),"trailer","<< /Size 6 /Root 1 0 R >>","startxref",String(xref),"%%EOF",""];
  parts.push(encoder.encode(rows.join("\n")));
  return joinBytes(parts);
}

function loadReceiptLogo(){
  return new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("Не удалось загрузить логотип"));image.src="/uk-school-logo.jpg";
  });
}

function drawWrapped(context:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,lineHeight:number,maxLines=3){
  const words=String(text||"").split(/\s+/);let line="";let row=0;
  for(const word of words){
    const next=line?`${line} ${word}`:word;
    if(context.measureText(next).width>maxWidth&&line){context.fillText(line,x,y+row*lineHeight);row+=1;line=word;if(row>=maxLines-1)break}else line=next;
  }
  if(line&&row<maxLines)context.fillText(line,x,y+row*lineHeight);
}

export default function FinancePortal({profile}:{profile:SchoolUser}){
  const [open,setOpen]=useState(false);
  const [records,setRecords]=useState<RecordItem[]>([]);
  const [summary,setSummary]=useState<Summary>(emptySummary);
  const [students,setStudents]=useState<Student[]>([]);
  const [classes,setClasses]=useState<SchoolClass[]>([]);
  const [creating,setCreating]=useState(false);
  const [status,setStatus]=useState("");
  const [type,setType]=useState("");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [reportOpen,setReportOpen]=useState(false);
  const [reportLoading,setReportLoading]=useState(false);
  const [reportMonth,setReportMonth]=useState(()=>new Date().toISOString().slice(0,7));
  const [reportClass,setReportClass]=useState("");
  const [report,setReport]=useState<ReportSummary>(emptyReport);
  const [debtors,setDebtors]=useState<Debtor[]>([]);
  const [receipt,setReceipt]=useState<RecordItem|null>(null);
  const [pdfBusy,setPdfBusy]=useState(false);
  const canManage=profile.role==="admin";

  const visibleRecords=useMemo(()=>{
    const value=search.trim().toLocaleLowerCase("ru");
    if(!value)return records;
    return records.filter(item=>[item.title,item.description,item.studentName,item.className,typeNames[item.type],statusNames[item.status]].some(part=>String(part||"").toLocaleLowerCase("ru").includes(value)));
  },[records,search]);

  async function load(show=true,nextStatus=status,nextType=type){
    if(show)setOpen(true);
    setLoading(true);setError("");
    try{
      const query=new URLSearchParams();
      if(nextStatus)query.set("status",nextStatus);
      if(nextType)query.set("type",nextType);
      const [listResponse,summaryResponse]=await Promise.all([fetch(`/api/finance/records?${query}`),fetch("/api/finance/summary")]);
      const [list,totals]=await Promise.all([apiJson<ListPayload>(listResponse),apiJson<SummaryPayload>(summaryResponse)]);
      setRecords(list.records||[]);setStudents(list.students||[]);setClasses(list.classes||[]);setSummary(totals.summary||emptySummary);
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось загрузить финансовые данные")}
    finally{setLoading(false)}
  }

  async function loadReport(nextMonth=reportMonth,nextClass=reportClass){
    setReportLoading(true);setError("");
    try{
      const query=new URLSearchParams({month:nextMonth});
      if(nextClass)query.set("class_id",nextClass);
      const data=await apiJson<ReportPayload>(await fetch(`/api/finance/report?${query}`));
      setReport(data.summary||emptyReport);setDebtors(data.debtors||[]);
      if(data.classes?.length)setClasses(data.classes);
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось загрузить финансовый отчёт")}
    finally{setReportLoading(false)}
  }

  function toggleReport(){
    const next=!reportOpen;setReportOpen(next);
    if(next)loadReport();
  }

  useEffect(()=>{const handler=()=>load(true);window.addEventListener("open-school-finance",handler);return()=>window.removeEventListener("open-school-finance",handler)},[status,type]);
  useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[open]);
  useEffect(()=>{if(!receipt)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setReceipt(null)};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[receipt]);

  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setError("");
    const form=event.currentTarget;
    try{
      await apiJson<{error?:string;ok?:boolean}>(await fetch("/api/finance/records",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(form)))}));
      form.reset();setCreating(false);await load(false);
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось сохранить запись")}
    finally{setBusy(false)}
  }

  async function changeStatus(item:RecordItem,next:FinanceStatus){
    setBusy(true);setError("");
    try{await apiJson(await fetch(`/api/finance/records/${item.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:next})}));await load(false)}
    catch(cause){setError(cause instanceof Error?cause.message:"Не удалось изменить статус")}
    finally{setBusy(false)}
  }

  async function edit(item:RecordItem){
    const title=prompt("Название записи",item.title);if(title===null)return;
    const amount=prompt("Сумма в тенге",String(item.amount));if(amount===null)return;
    setBusy(true);setError("");
    try{await apiJson(await fetch(`/api/finance/records/${item.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({title,amount})}));await load(false)}
    catch(cause){setError(cause instanceof Error?cause.message:"Не удалось изменить запись")}
    finally{setBusy(false)}
  }

  async function remove(item:RecordItem){
    if(!confirm(`Удалить «${item.title}»?`))return;
    setBusy(true);setError("");
    try{await apiJson(await fetch(`/api/finance/records/${item.id}`,{method:"DELETE"}));await load(false)}
    catch(cause){setError(cause instanceof Error?cause.message:"Не удалось удалить запись")}
    finally{setBusy(false)}
  }

  function chooseStatus(value:string){setStatus(value);load(false,value,type)}
  function chooseType(value:string){setType(value);load(false,status,value)}
  const receiptNumber=(item:RecordItem)=>`UK-${(item.paidAt||item.createdAt).slice(0,10).replaceAll("-","")}-${item.id.slice(0,8).toUpperCase()}`;
  const receiptReference=(item:RecordItem)=>item.id.replaceAll("-","").slice(-12).toUpperCase();

  async function downloadReceipt(item:RecordItem){
    if(pdfBusy)return;setPdfBusy(true);setError("");
    try{
      const canvas=document.createElement("canvas");canvas.width=1240;canvas.height=1754;
      const context=canvas.getContext("2d");if(!context)throw new Error("Браузер не поддерживает создание PDF");
      const navy="#123c62",blue="#1d6697",gold="#b78327",muted="#74879a",line="#dce6ee",green="#087456";
      const box=(x:number,y:number,w:number,h:number,r:number,fill:string|CanvasGradient,stroke?:string)=>{context.beginPath();context.roundRect(x,y,w,h,r);context.fillStyle=fill;context.fill();if(stroke){context.strokeStyle=stroke;context.lineWidth=2;context.stroke()}};
      const label=(text:string,x:number,y:number)=>{context.fillStyle=muted;context.font="700 18px Arial, sans-serif";context.fillText(text.toUpperCase(),x,y)};
      const value=(text:string,x:number,y:number,size=27)=>{context.fillStyle=navy;context.font=`700 ${size}px Arial, sans-serif`;context.fillText(text,x,y)};
      context.fillStyle="#f3f7fb";context.fillRect(0,0,canvas.width,canvas.height);
      box(55,45,1130,1664,34,"#ffffff","#d7e2eb");
      const gradient=context.createLinearGradient(55,45,1185,45);gradient.addColorStop(0,"#79162a");gradient.addColorStop(.38,"#d0a448");gradient.addColorStop(.7,navy);gradient.addColorStop(1,"#79162a");context.fillStyle=gradient;context.fillRect(55,45,1130,12);
      const logo=await loadReceiptLogo();box(95,100,145,145,26,"#fffaf0","#ead8b1");context.drawImage(logo,108,112,119,119);
      context.fillStyle=gold;context.font="800 20px Arial, sans-serif";context.letterSpacing="3px";context.fillText("UK SCHOOL OF TASHKENT",275,132);context.letterSpacing="0px";
      context.fillStyle=navy;context.font="700 49px Georgia, serif";context.fillText("Квитанция об оплате",275,195);
      context.fillStyle=muted;context.font="22px Arial, sans-serif";context.fillText("Официальное подтверждение проведённой операции",275,232);
      box(925,125,205,62,31,"#e2f7ef","#bde7d9");context.fillStyle=green;context.font="800 20px Arial, sans-serif";context.fillText("✓  ОПЛАЧЕНО",960,164);
      context.strokeStyle=line;context.lineWidth=2;context.beginPath();context.moveTo(95,285);context.lineTo(1145,285);context.stroke();
      box(95,325,660,98,17,"#f5f8fb",line);label("Номер квитанции",120,357);value(receiptNumber(item),120,397,25);
      box(775,325,370,98,17,"#f5f8fb",line);label("Сформировано",800,357);value(new Date().toLocaleDateString("ru-RU"),800,397,25);
      const details=[
        ["Плательщик",item.studentName||"Школа"],["Класс",item.className||"—"],
        ["Назначение платежа",item.title],["Дата оплаты",showDate(item.paidAt)],
        ["Тип операции",typeNames[item.type]||item.type],["Способ подтверждения","Внутренняя запись школы"],
      ];
      details.forEach(([title,text],index)=>{
        const column=index%2,row=Math.floor(index/2),x=95+column*525,y=460+row*126;
        box(x,y,525,126,0,"#ffffff",line);label(title,x+24,y+38);value(String(text),x+24,y+82,24);
      });
      box(95,865,1050,135,18,"#f5f8fb",line);label("Комментарий",120,903);context.fillStyle=navy;context.font="24px Arial, sans-serif";drawWrapped(context,item.description||"Оплата зарегистрирована в финансовой системе школы",120,947,990,31,2);
      const total=context.createLinearGradient(95,0,1145,0);total.addColorStop(0,"#0e2d4b");total.addColorStop(1,blue);box(95,1035,1050,150,22,total);
      context.fillStyle="#ffffff";context.font="700 21px Arial, sans-serif";context.fillText("Сумма операции",125,1082);context.fillStyle="#bfd2e1";context.font="18px Arial, sans-serif";context.fillText("Безналичный внутренний учёт · KZT",125,1120);
      context.fillStyle="#ffffff";context.font="700 50px Georgia, serif";context.textAlign="right";context.fillText(money(item.amount),1110,1127);context.textAlign="left";
      box(95,1220,1050,130,18,"#fbfdff",line);box(120,1247,74,74,20,"#e2f7ef");context.fillStyle=green;context.font="700 38px Arial";context.fillText("✓",139,1298);value("Подлинность подтверждена",220,1272,23);context.fillStyle=muted;context.font="19px Arial";context.fillText(`Контрольный код: ${receiptReference(item)}`,220,1305);
      context.strokeStyle=line;context.setLineDash([8,7]);context.beginPath();context.moveTo(95,1400);context.lineTo(1145,1400);context.stroke();context.setLineDash([]);
      value("UK School of Tashkent",95,1452,25);context.fillStyle=muted;context.font="19px Arial";context.fillText("Финансовый отдел · Ташкент",95,1485);
      context.fillStyle=muted;context.font="18px Arial";drawWrapped(context,"Квитанция подтверждает запись во внутренней финансовой системе школы. Подлинность проверяется по номеру квитанции и контрольному коду.",95,1545,1040,28,3);
      context.fillStyle="#a7b3bf";context.font="16px Arial";context.textAlign="center";context.fillText("Документ сформирован автоматически · UK School of Tashkent",620,1650);context.textAlign="left";
      const jpegBlob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Не удалось сформировать PDF")),"image/jpeg",.95));
      const pdf=jpegAsPdf(new Uint8Array(await jpegBlob.arrayBuffer()),canvas.width,canvas.height);
      const url=URL.createObjectURL(new Blob([pdf],{type:"application/pdf"}));
      const link=document.createElement("a");link.href=url;link.download=`Квитанция-${receiptNumber(item)}.pdf`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось скачать квитанцию")}
    finally{setPdfBusy(false)}
  }

  return <>
    <button className="finance-fab" onClick={()=>load(true)}>₸ Финансы</button>
    {open&&<div className="finance-back">
      <section className="finance-modal" aria-label="Финансовый кабинет">
        <header className="finance-head">
          <div><span>UK SCHOOL OF TASHKENT · FINANCE</span><h2>Финансовый кабинет</h2><p>{canManage?"Начисления, оплаты и расходы школы в одном месте":"Ваши начисления и история оплаты"}</p></div>
          <div className="finance-head-actions"><button onClick={()=>load(false)} disabled={loading}>↻</button><button onClick={()=>setOpen(false)} aria-label="Закрыть">×</button></div>
        </header>

        <div className="finance-stats">
          <article className="paid"><i>✓</i><div><span>Оплачено</span><strong>{money(summary.totalPaid)}</strong><small>{summary.countPaid} записей</small></div></article>
          <article className="pending"><i>⌛</i><div><span>Ожидает оплаты</span><strong>{money(summary.totalPending)}</strong><small>{summary.countPending} записей</small></div></article>
          <article className="danger"><i>!</i><div><span>Просрочено</span><strong>{money(summary.totalOverdue)}</strong><small>{summary.countOverdue} записей</small></div></article>
          <article className="expense"><i>↘</i><div><span>Расходы</span><strong>{money(summary.totalExpenses)}</strong><small>внутренний учёт</small></div></article>
        </div>

        <div className="finance-workbar">
          <div className="finance-search"><span>⌕</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Найти ученика, класс или запись"/></div>
          <select value={type} onChange={event=>chooseType(event.target.value)}><option value="">Все операции</option>{Object.entries(typeNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
          {canManage&&<button className={`finance-report-button ${reportOpen?"active":""}`} onClick={toggleReport}>▦ {reportOpen?"Скрыть отчёт":"Отчёты"}</button>}
          {canManage&&<button className="finance-create" onClick={()=>setCreating(value=>!value)}>{creating?"× Закрыть форму":"＋ Новая запись"}</button>}
        </div>

        <nav className="finance-tabs">
          {[['','Все'],['pending','Ожидают'],['paid','Оплачено'],['overdue','Просрочено'],['cancelled','Отменено']].map(([value,label])=><button key={value} className={status===value?"active":""} onClick={()=>chooseStatus(value)}>{label}</button>)}
        </nav>

        {canManage&&reportOpen&&<section className="finance-report">
          <div className="finance-report-head">
            <div><span>ФИНАНСОВАЯ АНАЛИТИКА</span><h3>Месячный отчёт</h3><p>Начисления, оплаты и задолженности считаются напрямую из D1.</p></div>
            <div className="finance-report-filters">
              <label>Месяц<input type="month" value={reportMonth} onChange={event=>{setReportMonth(event.target.value);loadReport(event.target.value,reportClass)}}/></label>
              <label>Класс<select value={reportClass} onChange={event=>{setReportClass(event.target.value);loadReport(reportMonth,event.target.value)}}><option value="">Все классы</option>{classes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <button onClick={()=>loadReport()} disabled={reportLoading}>{reportLoading?"Считаем…":"Обновить"}</button>
            </div>
          </div>
          <div className="finance-report-cards">
            <article><span>Начислено</span><strong>{money(report.charged)}</strong><small>{report.recordCount} операций</small></article>
            <article className="green"><span>Оплачено</span><strong>{money(report.paid)}</strong><small>{report.charged?Math.round(report.paid/report.charged*100):0}% от начислений</small></article>
            <article className="amber"><span>Ожидается</span><strong>{money(report.pending)}</strong><small>ещё не просрочено</small></article>
            <article className="red"><span>Просрочено</span><strong>{money(report.overdue)}</strong><small>требует внимания</small></article>
            <article className="blue"><span>Расходы</span><strong>{money(report.expenses)}</strong><small>за выбранный месяц</small></article>
          </div>
          <div className="finance-debtors">
            <div className="finance-debtors-title"><div><strong>Список должников</strong><span>Неоплаченные начисления на конец выбранного месяца</span></div><b>{debtors.length}</b></div>
            {debtors.map((debtor,index)=><div className="finance-debtor" key={debtor.studentId}>
              <i>{index+1}</i><div><strong>{debtor.studentName}</strong><span>{debtor.className||"Класс не указан"} · {debtor.debtCount} начислений</span></div><small>Первый срок: {showDate(debtor.oldestDueDate)}</small><b>{money(debtor.debtAmount)}</b>
            </div>)}
            {!reportLoading&&!debtors.length&&<div className="finance-no-debt">✓ Задолженностей за выбранный период нет</div>}
          </div>
        </section>}

        {creating&&<form className="finance-form" onSubmit={create}>
          <div className="finance-form-title"><div><strong>Новая финансовая запись</strong><span>Укажите назначение и получателя. Повторное начисление система не пропустит.</span></div></div>
          <label>Операция<select name="type" required defaultValue="fee"><option value="fee">Начисление ученику</option><option value="income">Доход школы</option><option value="expense">Расход школы</option><option value="event_budget">Бюджет мероприятия</option><option value="shop">Магазин</option></select></label>
          <label>Название<input name="title" maxLength={160} required placeholder="Например, Школьный взнос за сентябрь"/></label>
          <label>Сумма, ₸<input name="amount" type="number" min="1" step="1" required placeholder="0"/></label>
          <label>Статус<select name="status" defaultValue="pending"><option value="pending">Ожидает оплаты</option><option value="paid">Уже оплачено</option><option value="cancelled">Отменено</option></select></label>
          <label>Ученик<select name="studentId" defaultValue=""><option value="">Не выбран</option>{students.map(student=><option key={student.id} value={student.id}>{student.fullName}{student.className?` — ${student.className}`:""}</option>)}</select></label>
          <label>Класс<select name="classId" defaultValue=""><option value="">Не выбран</option>{classes.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Срок оплаты<input name="dueDate" type="date"/></label>
          <label className="wide">Комментарий<textarea name="description" rows={2} maxLength={2000} placeholder="Необязательно"/></label>
          <div className="finance-form-actions"><button type="button" onClick={()=>setCreating(false)}>Отмена</button><button className="save" disabled={busy}>{busy?"Сохраняем…":"Сохранить запись"}</button></div>
        </form>}

        {error&&<div className="finance-error" role="alert"><strong>Не удалось выполнить действие</strong><span>{error}</span><button onClick={()=>load(false)}>Повторить</button></div>}

        <div className="finance-table">
          <div className="finance-row finance-labels"><span>Назначение</span><span>Операция</span><span>Сумма</span><span>Статус</span><span>Получатель</span><span>Срок</span><span>Оплачено</span><span>Документы</span></div>
          {visibleRecords.map(item=><div className="finance-row" key={item.id}>
            <div className="finance-name"><strong>{item.title}</strong><small>{item.description||`Создано ${showDate(item.createdAt)}`}</small></div>
            <span data-label="Операция">{typeNames[item.type]||item.type}</span>
            <b data-label="Сумма">{money(item.amount)}</b>
            <div data-label="Статус">{canManage?<select aria-label={`Статус ${item.title}`} className={`finance-status ${item.status}`} value={item.status} disabled={busy} onChange={event=>changeStatus(item,event.target.value as FinanceStatus)}>{Object.entries(statusNames).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:<em className={`finance-pill ${item.status}`}>{statusNames[item.status]}</em>}</div>
            <span data-label="Получатель">{item.studentName||item.className||"Администрация"}</span>
            <span data-label="Срок">{showDate(item.dueDate)}</span>
            <span data-label="Оплата">{showDate(item.paidAt)}</span>
            <div className="finance-actions">
              {item.status==="paid"&&<button className="receipt-button" onClick={()=>setReceipt(item)}>Квитанция</button>}
              {canManage&&<button onClick={()=>edit(item)}>Изменить</button>}
              {canManage&&<button onClick={()=>remove(item)}>Удалить</button>}
            </div>
          </div>)}
          {!loading&&!visibleRecords.length&&<div className="finance-empty"><i>₸</i><strong>{search?"Ничего не найдено":"Финансовых записей пока нет"}</strong><span>{search?"Измените запрос или очистите фильтры":canManage?"Создайте первое начисление или расход":"Для вас пока ничего не назначено"}</span></div>}
          {loading&&<div className="finance-empty"><i className="finance-loader"/><strong>Загружаем финансы…</strong></div>}
        </div>
      </section>
      {receipt&&<div className="receipt-back" onMouseDown={event=>{if(event.target===event.currentTarget)setReceipt(null)}}>
        <article className="receipt-sheet" aria-label="Квитанция об оплате">
          <div className="receipt-watermark" aria-hidden="true">UK</div>
          <div className="receipt-toolbar">
            <button onClick={()=>setReceipt(null)}>← Вернуться</button>
            <div><button onClick={()=>navigator.clipboard?.writeText(receiptNumber(receipt))}>Копировать номер</button><button className="receipt-download" disabled={pdfBusy} onClick={()=>downloadReceipt(receipt)}>{pdfBusy?"Создаём PDF…":"↓ Скачать PDF"}</button><button className="receipt-print" onClick={()=>window.print()}>⌁ Печать</button></div>
          </div>
          <header className="receipt-header">
            <div className="receipt-logo"><img src="/uk-school-logo.jpg" alt="UK School of Tashkent"/></div>
            <div><span>UK SCHOOL OF TASHKENT</span><h2>Квитанция об оплате</h2><p>Официальное подтверждение проведённой операции</p></div>
            <b><i>✓</i> ОПЛАЧЕНО</b>
          </header>
          <div className="receipt-number">
            <div><span>Номер квитанции</span><strong>{receiptNumber(receipt)}</strong></div>
            <div><span>Сформировано</span><strong>{new Date().toLocaleDateString("ru-RU")}</strong></div>
          </div>
          <dl className="receipt-details">
            <div><dt>Плательщик</dt><dd>{receipt.studentName||"Не указан"}</dd></div>
            <div><dt>Класс</dt><dd>{receipt.className||"Не указан"}</dd></div>
            <div><dt>Назначение платежа</dt><dd>{receipt.title}</dd></div>
            <div><dt>Дата оплаты</dt><dd>{showDate(receipt.paidAt)}</dd></div>
            <div><dt>Тип операции</dt><dd>{typeNames[receipt.type]||receipt.type}</dd></div>
            <div><dt>Способ подтверждения</dt><dd>Внутренняя запись школы</dd></div>
          </dl>
          {receipt.description&&<div className="receipt-note"><span>Комментарий</span><p>{receipt.description}</p></div>}
          <div className="receipt-total"><div><span>Сумма операции</span><small>Безналичный внутренний учёт · KZT</small></div><strong>{money(receipt.amount)}</strong></div>
          <div className="receipt-verification">
            <div className="receipt-shield">✓</div>
            <div><strong>Документ сформирован системой школы</strong><span>Контрольный код: {receiptReference(receipt)}</span></div>
            <small>Запись защищена идентификатором операции</small>
          </div>
          <footer className="receipt-footer"><div><strong>UK School of Tashkent</strong><span>Финансовый отдел · Ташкент</span></div><p>Квитанция подтверждает запись во внутренней финансовой системе школы. Подлинность проверяется по номеру квитанции и контрольному коду.</p></footer>
        </article>
      </div>}
    </div>}
  </>;
}
