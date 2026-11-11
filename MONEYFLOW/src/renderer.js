const $ = s => document.querySelector(s);
const rub = n => new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:0}).format(Number(n)||0);
const today = new Date().toISOString().slice(0,10);
const expenseCats = ['Еда','Транспорт','Жильё','Покупки','Развлечения','Подписки','Здоровье','Игры','Образование','Прочее'];
const incomeCats = ['Зарплата','Подработка','Фриланс','Продажи','Подарки','Инвестиции','Прочее'];
let transactions = [], budgets = [], goals = [], cashChart, catChart, analyticsChart;
$('#today').textContent = new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
$('#tx-date').value = today;
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function monthKey(d){return d.slice(0,7)}
function currentMonth(){return today.slice(0,7)}
function sum(list,type){return list.filter(x=>x.type===type).reduce((a,x)=>a+Number(x.amount),0)}
function monthTx(){return transactions.filter(x=>monthKey(x.date)===currentMonth())}
function moneyLabel(n){return rub(n)}
function showPage(name){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===name));document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===name));$('#page-title').textContent=({dashboard:'Обзор',transactions:'Операции',analytics:'Аналитика',budgets:'Бюджеты',goals:'Цели накопления',calendar:'Календарь',banks:'Банки и резервные копии'})[name];renderAll()}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.goto)));
function openTx(){ $('#tx-modal').classList.add('open'); $('#tx-amount').focus(); }
function closeModals(){document.querySelectorAll('.modal-backdrop').forEach(x=>x.classList.remove('open'))}
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeModals));
$('#quick-add').onclick=$('#add-from-transactions').onclick=openTx;
document.querySelectorAll('.type-btn').forEach(b=>b.onclick=()=>{document.querySelectorAll('.type-btn').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');$('#tx-type').value=b.dataset.type;fillCategories()});
function fillCategories(){const list=$('#tx-type').value==='income'?incomeCats:expenseCats;$('#tx-category').innerHTML=list.map(c=>`<option>${c}</option>`).join('')}
fillCategories();
$('#tx-form').onsubmit=async e=>{e.preventDefault();try{await window.moneyflow.addTransaction({type:$('#tx-type').value,amount:$('#tx-amount').value,category:$('#tx-category').value,description:$('#tx-description').value,date:$('#tx-date').value});e.target.reset();$('#tx-date').value=today;$('#tx-type').value='expense';document.querySelectorAll('.type-btn').forEach(x=>x.classList.toggle('selected',x.dataset.type==='expense'));fillCategories();closeModals();await refresh();toast('Операция сохранена')}catch(err){toast(err.message)}};
$('#import-btn').onclick=async()=>{try{const r=await window.moneyflow.importCsv();if(r.imported){await refresh();toast(`Импортировано операций: ${r.imported}`)}else toast('Импорт отменён или подходящих строк нет')}catch(e){toast(e.message)}};
$('#search-tx').oninput=renderTransactions;$('#filter-type').onchange=renderTransactions;
async function refresh(){transactions=await window.moneyflow.listTransactions();budgets=await window.moneyflow.listBudgets();goals=await window.moneyflow.listGoals();renderAll();await loadRecurring();renderCalendar();renderInsights();renderBanks();await renderYearAnalytics()}
function renderAll(){renderDashboard();renderTransactions();renderAnalytics();renderBudgets();renderGoals()}
function renderDashboard(){
 const m=monthTx(), inc=sum(m,'income'), exp=sum(m,'expense');
 $('#balance').textContent=rub(sum(transactions,'income')-sum(transactions,'expense'));$('#income').textContent=rub(inc);$('#expense').textContent=rub(exp);$('#net').textContent=rub(inc-exp);
 const labels=[], ins=[], outs=[];for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);const key=d.toISOString().slice(0,7);labels.push(new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(d));const arr=transactions.filter(t=>monthKey(t.date)===key);ins.push(sum(arr,'income'));outs.push(sum(arr,'expense'))}
 if(cashChart)cashChart.destroy();cashChart=new Chart($('#cashflow-chart'),{type:'line',data:{labels,datasets:[{label:'Доходы',data:ins,borderColor:'#54d6a0',backgroundColor:'#54d6a022',fill:true,tension:.38},{label:'Расходы',data:outs,borderColor:'#ff7185',backgroundColor:'#ff718522',fill:true,tension:.38}]},options:chartOpts()});
 const cats={};m.filter(t=>t.type==='expense').forEach(t=>cats[t.category]=(cats[t.category]||0)+Number(t.amount));const entries=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
 if(catChart)catChart.destroy();catChart=new Chart($('#category-chart'),{type:'doughnut',data:{labels:entries.map(x=>x[0]),datasets:[{data:entries.map(x=>x[1]),backgroundColor:['#8b7cff','#54d6a0','#ff7185','#f6bd60','#58a6ff','#c792ea','#6ed0d5','#a3be8c'],borderWidth:0}]},options:{plugins:{legend:{display:false}},cutout:'72%',maintainAspectRatio:false}});
 $('#category-legend').innerHTML=entries.slice(0,6).map((x,i)=>`<div class="legend-item"><span class="legend-dot" style="background:${['#8b7cff','#54d6a0','#ff7185','#f6bd60','#58a6ff','#c792ea'][i]}"></span>${esc(x[0])} · ${rub(x[1])}</div>`).join('')||'<span class="muted">Нет расходов за месяц</span>';
 const recent=transactions.slice(0,5);$('#recent-list').className='transaction-list'+(recent.length?'':' empty-state');$('#recent-list').innerHTML=recent.length?recent.map(txRow).join(''):'Пока нет операций. Добавьте первую запись.';
}
function chartOpts(){return{responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},plugins:{legend:{labels:{color:'#9ba5b6',usePointStyle:true,boxWidth:7,font:{size:10}}}},scales:{x:{grid:{display:false},ticks:{color:'#7f899a',font:{size:10}}},y:{grid:{color:'#252d3b'},ticks:{color:'#7f899a',font:{size:10},callback:v=>new Intl.NumberFormat('ru-RU',{notation:'compact'}).format(v)}}}}}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function txRow(t){return `<div class="tx-row"><div class="tx-main"><div class="tx-icon">${t.type==='income'?'↗':'↘'}</div><div><b>${esc(t.description||t.category)}</b><small>${esc(t.category)}</small></div></div><span class="muted">${new Date(t.date+'T12:00:00').toLocaleDateString('ru-RU')}</span><span class="tx-amount ${t.type==='income'?'income-text':'expense-text'}">${t.type==='income'?'+':'−'}${rub(t.amount)}</span></div>`}
function renderTransactions(){const q=($('#search-tx')?.value||'').toLowerCase(),type=$('#filter-type')?.value||'all';const list=transactions.filter(t=>(type==='all'||t.type===type)&&(`${t.description} ${t.category}`).toLowerCase().includes(q));$('#transactions-table').innerHTML=list.map(t=>`<tr><td><b>${esc(t.description||t.category)}</b></td><td>${esc(t.category)}</td><td>${new Date(t.date+'T12:00:00').toLocaleDateString('ru-RU')}</td><td class="${t.type==='income'?'income-text':'expense-text'}">${t.type==='income'?'+':'−'}${rub(t.amount)}</td><td><button class="delete-btn" data-delete="${t.id}" title="Удалить">×</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty-state">Операций не найдено</td></tr>';document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Удалить эту операцию?')){await window.moneyflow.deleteTransaction(b.dataset.delete);await refresh();toast('Операция удалена')}})}
function renderAnalytics(){const list=$('#analytics-period').value==='all'?transactions:monthTx(),ex=list.filter(t=>t.type==='expense'),inc=sum(list,'income'),out=sum(list,'expense');$('#tx-count').textContent=list.length;$('#avg-day').textContent=rub(out/Math.max(1,new Set(ex.map(t=>t.date)).size));const cats={};ex.forEach(t=>cats[t.category]=(cats[t.category]||0)+Number(t.amount));const entries=Object.entries(cats).sort((a,b)=>b[1]-a[1]);$('#top-category').textContent=entries[0]?.[0]||'—';$('#analytics-categories').innerHTML=entries.map(([k,v])=>`<div class="break-row"><span>${esc(k)}</span><b>${rub(v)}</b><div class="bar"><span style="width:${Math.max(2,v/(entries[0][1]||1)*100)}%"></span></div></div>`).join('')||'<div class="empty-state">Пока недостаточно данных</div>';const labels=[],a=[],b=[];for(let i=5;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);const key=d.toISOString().slice(0,7);labels.push(new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(d));const rows=transactions.filter(t=>monthKey(t.date)===key);a.push(sum(rows,'income'));b.push(sum(rows,'expense'))}if(analyticsChart)analyticsChart.destroy();analyticsChart=new Chart($('#analytics-chart'),{type:'bar',data:{labels,datasets:[{label:'Доходы',data:a,backgroundColor:'#54d6a0',borderRadius:5},{label:'Расходы',data:b,backgroundColor:'#ff7185',borderRadius:5}]},options:chartOpts()})}
$('#analytics-period').onchange=renderAnalytics;
let yearChart;
async function renderYearAnalytics(){
 const years=[...new Set([new Date().getFullYear(),...transactions.map(t=>Number(t.date.slice(0,4)))])].sort((a,b)=>b-a);
 const sel=$('#year-select');if(!sel)return;const old=sel.value;sel.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');sel.value=years.includes(Number(old))?old:String(new Date().getFullYear());
 const year=sel.value,rows=await window.moneyflow.getYearAnalytics(year),inc=Array(12).fill(0),exp=Array(12).fill(0);
 rows.forEach(row=>{const i=Number(row.month)-1;if(i>=0&&i<12)(row.type==='income'?inc:exp)[i]=Number(row.total)});
 const totalIn=inc.reduce((a,b)=>a+b,0),totalOut=exp.reduce((a,b)=>a+b,0);
 $('#year-income').textContent=rub(totalIn);$('#year-expense').textContent=rub(totalOut);$('#year-net').textContent=rub(totalIn-totalOut);
 if(yearChart)yearChart.destroy();
 yearChart=new Chart($('#year-chart'),{type:'bar',data:{labels:['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'],datasets:[{label:'Доходы',data:inc,backgroundColor:'#54d6a0',borderRadius:5},{label:'Расходы',data:exp,backgroundColor:'#ff7185',borderRadius:5}]},options:chartOpts()});
}
$('#year-select').onchange=renderYearAnalytics;
function renderBudgets(){const m=monthTx().filter(t=>t.type==='expense');$('#budgets-list').innerHTML=budgets.map(b=>{const spent=m.filter(t=>t.category===b.category).reduce((a,t)=>a+Number(t.amount),0),pct=spent/Number(b.limit_amount)*100;return `<article class="budget-card"><h3>${esc(b.category)}</h3><p>Лимит на текущий месяц</p><div class="budget-numbers"><b>${rub(spent)} потрачено</b><span>${rub(b.limit_amount)}</span></div><div class="progress ${pct>100?'over':''}"><span style="width:${Math.min(100,pct)}%"></span></div><p style="margin-top:9px">${pct>100?'Лимит превышен':`Использовано ${Math.round(pct)}%`}</p></article>`}).join('')||'<div class="panel empty-state">Бюджеты ещё не настроены. Добавьте лимит для категории.</div>'}
function renderGoals(){$('#goals-list').innerHTML=goals.map(g=>{const pct=Math.min(100,Number(g.saved)/Number(g.target)*100);return `<article class="goal-card"><h3>${esc(g.name)}</h3><p>${g.deadline?'Цель до '+new Date(g.deadline+'T12:00:00').toLocaleDateString('ru-RU'):'Накопительная цель'}</p><div class="budget-numbers"><b>${rub(g.saved)} накоплено</b><span>${rub(g.target)}</span></div><div class="progress"><span style="width:${pct}%"></span></div><p style="margin-top:9px">${Math.round(pct)}% · осталось ${rub(Math.max(0,g.target-g.saved))}</p></article>`}).join('')||'<div class="panel empty-state">У вас пока нет целей накопления.</div>'}
function simpleModal(title,eyebrow,fields,submit){$('#simple-title').textContent=title;$('#simple-eyebrow').textContent=eyebrow;$('#simple-fields').innerHTML=fields;$('#simple-modal').classList.add('open');$('#simple-form').onsubmit=async e=>{e.preventDefault();try{await submit();closeModals();await refresh();toast('Изменения сохранены')}catch(err){toast(err.message)}}}
$('#add-budget').onclick=()=>simpleModal('Новый лимит','БЮДЖЕТ',`<label>Категория<input name="category" required placeholder="Например, Еда"></label><label>Лимит, ₽<input name="limit" type="number" min="1" required></label>`,async()=>{const f=new FormData($('#simple-form'));await window.moneyflow.saveBudget({category:f.get('category'),limit_amount:f.get('limit')})});
$('#add-goal').onclick=()=>simpleModal('Новая цель','НАКОПЛЕНИЯ',`<label>Название цели<input name="name" required placeholder="Например, Новый ноутбук"></label><label>Необходимая сумма, ₽<input name="target" type="number" min="1" required></label><label>Уже накоплено, ₽<input name="saved" type="number" min="0" value="0"></label><label>Желаемая дата<input name="deadline" type="date"></label>`,async()=>{const f=new FormData($('#simple-form'));await window.moneyflow.addGoal({name:f.get('name'),target:f.get('target'),saved:f.get('saved'),deadline:f.get('deadline')})});
$('#export-btn')?.addEventListener('click',()=>window.moneyflow.exportCsv());

let recurringPayments=[], calCursor=new Date(), selectedCalDate=today;
async function loadRecurring(){
  recurringPayments=await window.moneyflow.detectRecurring();
  const el=$('#recurring-list'); if(!el)return;
  el.innerHTML=recurringPayments.map(p=>`<div class="recurring-item"><div><b>${esc(p.description||p.category)}</b><small>${esc(p.category)} · ${p.cadence} · ${p.occurrences} повторения</small><small>Ожидаемая дата: ${new Date(p.next_date+'T12:00:00').toLocaleDateString('ru-RU')}</small></div><strong class="${p.type==='income'?'income-text':'expense-text'}">${p.type==='income'?'+':'−'}${rub(p.amount)}</strong></div>`).join('')||'Недостаточно повторений для выявления регулярного платежа. Это статистическая оценка, не банковское подтверждение.';
}
$('#detect-recurring').onclick=()=>loadRecurring().then(renderCalendar);
function renderInsights(){
 const m=monthTx(), prevD=new Date();prevD.setMonth(prevD.getMonth()-1);
 const prev=transactions.filter(t=>monthKey(t.date)===prevD.toISOString().slice(0,7));
 const out=sum(m,'expense'), old=sum(prev,'expense'), inc=sum(m,'income'), cats={};
 m.filter(t=>t.type==='expense').forEach(t=>cats[t.category]=(cats[t.category]||0)+Number(t.amount));
 const top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0], tips=[];
 if(!transactions.length)tips.push(['✦','Добавьте первые операции','Когда появится история, здесь будут персональные наблюдения.']);
 if(top)tips.push(['◈','Крупнейшая категория',`${top[0]} — ${rub(top[1])} за текущий месяц.`]);
 if(out>inc&&inc>0)tips.push(['!','Расходы выше доходов','По внесённым операциям расходы текущего месяца превышают доходы. Проверьте полноту записей.']);
 if(old>0&&out>old*1.1)tips.push(['↗','Расходы выросли',`Расходы выше прошлого месяца примерно на ${Math.round((out/old-1)*100)}%. Учитывайте, что текущий месяц может быть неполным.`]);
 if(recurringPayments.length)tips.push(['↻','Есть регулярные платежи',`Найдено ${recurringPayments.length} вероятных повторений. Проверьте их вручную.`]);
 if(!tips.length)tips.push(['✓','Продолжайте вести учёт','Больше записей — точнее сравнения и полезнее аналитика.']);
 $('#insights-list').innerHTML=tips.map(t=>`<div class="insight"><div class="insight-icon">${t[0]}</div><div><b>${t[1]}</b><p>${t[2]}</p></div></div>`).join('');
}
function renderCalendar(){
 const y=calCursor.getFullYear(),m=calCursor.getMonth(),first=new Date(y,m,1),offset=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate();
 $('#calendar-month').textContent=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(calCursor);
 let s=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>`<div class="calendar-weekday">${x}</div>`).join('');
 for(let i=0;i<42;i++){let d,muted=false;if(i<offset){d=new Date(y,m-1,prevDays-offset+i+1);muted=true}else if(i>=offset+days){d=new Date(y,m+1,i-offset-days+1);muted=true}else d=new Date(y,m,i-offset+1);
 const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,tx=transactions.filter(t=>t.date===key),income=tx.some(t=>t.type==='income'),expense=tx.some(t=>t.type==='expense');
 s+=`<button class="calendar-day ${muted?'muted-day':''} ${key===selectedCalDate?'selected':''} ${key===today?'today-day':''}" data-cal-date="${key}"><strong>${d.getDate()}</strong><span class="calendar-dots">${income?'<i></i>':''}${expense?'<i class="expense-dot"></i>':''}</span></button>`;
 }
 $('#calendar-grid').innerHTML=s;
 document.querySelectorAll('[data-cal-date]').forEach(b=>b.onclick=()=>{selectedCalDate=b.dataset.calDate;renderCalendar()});
 $('#selected-date-title').textContent='Операции: '+new Date(selectedCalDate+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
 const rows=transactions.filter(t=>t.date===selectedCalDate),due=recurringPayments.filter(p=>p.next_date===selectedCalDate);
 $('#calendar-details').innerHTML=[...rows.map(txRow),...due.map(p=>`<div class="recurring-item"><div><b>Прогноз регулярного платежа</b><small>${esc(p.description||p.category)} · не подтверждено банком</small></div><strong>${rub(p.amount)}</strong></div>`)].join('')||'<div class="empty-state">На эту дату нет операций или прогнозируемых платежей.</div>';
}
$('#cal-prev').onclick=()=>{calCursor.setMonth(calCursor.getMonth()-1);renderCalendar()};
$('#cal-next').onclick=()=>{calCursor.setMonth(calCursor.getMonth()+1);renderCalendar()};
async function renderBanks(){
 const providers=await window.moneyflow.listBankProviders();
 $('#bank-providers').innerHTML=providers.map(p=>`<div class="insight"><div class="insight-icon">⌁</div><div><b>${esc(p.name)}</b><p>${esc(p.note)}</p><small class="muted">Статус: не настроено</small></div></div>`).join('');
}
$('#backup-create').onclick=async()=>{try{const r=await window.moneyflow.createBackup();toast(r.saved?'Резервная копия создана':'Создание копии отменено')}catch(e){toast(e.message)}};
$('#backup-restore').onclick=async()=>{if(!confirm('Восстановление заменит текущую базу. Продолжить?'))return;try{const r=await window.moneyflow.restoreBackup();if(r.restored){await refresh();toast('База восстановлена')}else toast('Восстановление отменено')}catch(e){toast(e.message)}};

refresh().catch(e=>toast(e.message));
