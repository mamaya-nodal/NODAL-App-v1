(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
function id(){return 'r_'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'_'+Math.random().toString(36).slice(2))}
function text(v,label,max=120){if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw Error(label+' no válido.');return v.trim()}
function moneyInput(v){let s=String(v).trim().replace(/\s/g,'');if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s))s=s.replace(/\./g,'').replace(',','.');else if(/^\d+(,\d{1,2})?$/.test(s))s=s.replace(',','.');else if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('Ingresá un balance como 50000 o 50.000,00.');const cents=Math.round(Number(s)*100);if(!Number.isSafeInteger(cents)||cents<0||cents>1e12)throw Error('Balance fuera de rango.');return cents}
function days(v){const s=String(v);if(!/^\d+$/.test(s)||Number(s)>10000)throw Error('Los días operados deben ser un número entero entre 0 y 10000.');return Number(s)}
function make(graph){const G=graph,N=G.nodes,E=G.edges,contexts=new Map(G.contexts.map(x=>[x.id,x]));
const context=n=>contexts.get(n.context);
const companies=G.companies||[{id:'LUCID',name:'LUCID'}];
const bookInfo=book=>G.summary.base_books.find(b=>b.file===book);
const companyForBook=book=>bookInfo(book)?.company||'LUCID';
const companyForAccount=a=>companyForBook(a.book);
const expectedBalance=n=>Math.round((50000+n.state.fund_profit)*100);
const expectedDays=n=>n.history.length;
function op(n){if(n.company==='FTMO'){if(n.kind==='terminal')return n.terminal==='evaluation_approval'?'Evaluación completada':n.terminal==='payout_assumed'?'Retiro previsto en el Excel':'Transición no documentada';return (n.stage.startsWith('R')?'Recuperación '+n.stage.slice(1):n.phase==='eval'?'Evaluación día '+n.stage.slice(1):'Funded · '+n.stage)+' · sesión '+(n.history.length+1)}if(n.kind==='terminal')return n.terminal==='evaluation_approval'?'Evaluación completada':n.terminal==='payout_assumed'?'Retiro previsto en el Excel':'Fin de cobertura';return n.stage.startsWith('R')?'Recuperación '+n.stage.slice(1)+' · '+n.stage:(context(n).phase==='eval'?'Evaluación':'Funded')+' día '+n.stage.slice(1)+' · '+n.stage}
function history(n){if(n.full_history)return n.full_history.map(h=>(h.phase==='eval'?'Evaluación ':'Funded ')+h.stage+': '+(h.outcome==='TP'?'gané':h.outcome==='SOFT_DLL'?'perdí · Soft DLL':'perdí · SL del modelo')).join(' → ')||'Todavía sin operaciones';const seq=n.history.map(x=>(x[0][1].startsWith('R')?'Recuperación '+x[0][1].slice(1):'Día '+x[0][1].slice(1))+': '+(x[1]==='TP'?'gané':'perdí')).join(' → ')||'Todavía sin operaciones en esta etapa';const c=context(n);return (c.phase==='funded'?c.label+'. ':'')+seq}
function account(db,aid){for(const p of db.identities){const a=p.accounts.find(a=>a.id===aid);if(a)return a}throw Error('No se encontró la cuenta.')}
function mismatch(a,n){const reasons=[];if(a.balanceCents!==expectedBalance(n))reasons.push('El balance informado difiere del balance del Excel.');if(a.days!==expectedDays(n))reasons.push('Los días operados difieren de las sesiones previas del modelo.');return reasons}
function trackingUnresolved(a){
 let unresolved=false;
 for(const ev of a.events||[]){
  if(ev.kind==='route'||ev.kind==='phase'||ev.kind==='replica'&&['initial','route','phase'].includes(ev.reason))unresolved=ev.trackingNeedsReview===true;
  if(ev.kind==='replica'&&ev.reason==='sync'&&typeof ev.trackingNeedsReview==='boolean')unresolved=ev.trackingNeedsReview;
  if(ev.kind==='result'&&['TP','SL'].includes(ev.outcome)&&!ev.to)unresolved=true;
  if(ev.kind==='replica'&&ev.reason==='result'&&(['TP','SL'].includes(ev.outcome)&&E[N[ev.from]?.outcomes?.[ev.outcome]]?.to!==ev.to||ev.trackingNeedsReview===true))unresolved=true;
 }
 return unresolved;
}
function eligibility(a){
 if(!a.nodeId)return {ok:false,label:'Ubicá la cuenta en el mapa',reasons:['Falta identificar el recorrido y su historial.']};
 const n=N[a.nodeId],reasons=[];
 if(!n||n.book!==a.book||context(n)?.phase!==a.phase)return {ok:false,label:'Revisá la posición',reasons:['La posición no corresponde a la estrategia y etapa de esta cuenta.']};
 if(a.status==='quemada'||a.blockedOutcome)return {ok:false,label:'Continuación no documentada',reasons:['El Excel no documenta una continuación para '+(a.blockedOutcome==='BE'?'el cierre en cero':'la cuenta quemada')+'.']};
 if(!a.historyConfirmed)reasons.push('Falta confirmar el historial de entrada.');
 // Old numeric mismatches are harmless. An unlinked past trade is not: its position must be confirmed explicitly.
 if(trackingUnresolved(a))reasons.push('Hay un resultado anterior guardado sin continuación vinculada. Confirmá la posición actual; el historial se conservará.');
 return {ok:!reasons.length,label:reasons.length?'Revisá la posición':'Ruta histórica vinculada',reasons,referenceDifferences:mismatch(a,n)};
}
const riskMoneyFields=['floorCents','maxLossCents','dailyRemainingCents','targetBalanceCents','bestDayCents','cycleProfitCents','extraFeeCents'];
function validateRisk(r,a){
 if(!r||typeof r!=='object'||Array.isArray(r)||r.company!==companyForAccount(a)||!['eval','funded'].includes(r.phase)||!Number.isSafeInteger(r.asOfBalanceCents)||r.asOfBalanceCents<0||r.asOfBalanceCents>1e12||!Number.isInteger(r.asOfDays)||r.asOfDays<0||r.asOfDays>10000||typeof r.checkedAt!=='string'||!Number.isFinite(Date.parse(r.checkedAt)))throw Error('Límites de cuenta no válidos.');
 text(r.modality,'Modalidad',120);text(r.source,'Origen de los límites',400);
 if(r.asOfNodeId!==null&&(!N[r.asOfNodeId]||N[r.asOfNodeId].book!==a.book||context(N[r.asOfNodeId]).phase!==r.phase))throw Error('La revisión de límites pertenece a otra posición.');
 for(const k of riskMoneyFields)if(r[k]!==null&&(!Number.isSafeInteger(r[k])||(!['cycleProfitCents','dailyRemainingCents'].includes(k)&&r[k]<0)||Math.abs(r[k])>1e12))throw Error('Importe de límite no válido: '+k+'.');
 if(r.maxContracts!==null&&(!Number.isInteger(r.maxContracts)||r.maxContracts<0||r.maxContracts>10000))throw Error('Cantidad máxima de contratos no válida.');
 if(r.minDays!==null&&(!Number.isInteger(r.minDays)||r.minDays<0||r.minDays>10000))throw Error('Mínimo de días no válido.');
 if(r.consistencyPercent!==null&&(typeof r.consistencyPercent!=='number'||!Number.isFinite(r.consistencyPercent)||r.consistencyPercent<0||r.consistencyPercent>100))throw Error('Porcentaje de consistencia no válido.');
 if(![null,'NQ','MNQ'].includes(r.instrument)||![null,true,false].includes(r.coverageAllowed)||![null,true,false].includes(r.feesConfirmed)||![null,true,false].includes(r.dailyLimitApplies))throw Error('Configuración de límites no válida.');
 return r;
}
function updateRisk(a,data){
 openAccount(a);if(!data||typeof data!=='object')throw Error('Ingresá los límites de la cuenta.');
 const r={company:companyForAccount(a),modality:text(data.modality,'Modalidad',120),phase:a.phase,source:text(data.source,'Origen de los límites',400),checkedAt:new Date().toISOString(),asOfBalanceCents:a.balanceCents,asOfDays:a.days,asOfNodeId:a.nodeId};
 for(const k of [...riskMoneyFields,'maxContracts','minDays','consistencyPercent','instrument','coverageAllowed','feesConfirmed','dailyLimitApplies'])r[k]=data[k]===undefined||data[k]===null?null:data[k];
 validateRisk(r,a);a.riskContext=r;return a;
}
const usd=c=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'USD'}).format(c/100);
function assessment(a,nodeId=a.nodeId){
 const n=N[nodeId],current=nodeId===a.nodeId,tracking=eligibility(a),r=a.riskContext;
 const actualNetCents=(a.events||[]).filter(e=>e.kind==='result'||e.kind==='replica'&&e.reason==='result').reduce((v,e)=>v+(Number.isSafeInteger(e.actualFundCents)?e.actualFundCents:e.balanceCents-e.beforeBalance),0);
 const info={status:'adaptation',mathStatus:'adaptation',label:'Requiere adaptación',reasons:[],pending:[],notes:[],rulesIssues:[],rulesStatus:'pending',actualBalanceCents:a.balanceCents,historicalBalanceCents:n?expectedBalance(n):null,differenceCents:n?a.balanceCents-expectedBalance(n):null,actualNetCents,projectedSLBalanceCents:null,remainingDrawdownCents:null,targetRemainingCents:null,remainingDays:null,consistencyActualPercent:null,riskCurrent:false,trackingOK:tracking.ok,scope:'Simulación con saldo real; no es una autorización para operar.'};
 if(!n){info.pending.push('Elegí una posición documentada.');return info;}
 if(!current){info.pending.push('Este punto es una exploración. Su saldo real futuro y sus límites todavía no se conocen.');return info;}
 if(!tracking.ok)info.pending.push(...tracking.reasons);
 if(a.status==='quemada')info.reasons.push('La cuenta está marcada como quemada.');
 const sl=n.kind==='operation'?E[n.outcomes?.SL]:null,hedged=n.kind==='operation'&&Number(n.controls?.[8])>0;
 if(sl&&Number.isFinite(sl.fund_net))info.projectedSLBalanceCents=a.balanceCents+Math.round(sl.fund_net*100);
 if(hedged){
  info.rulesIssues=(G.rules?.items||[]).filter(x=>x.company===companyForAccount(a)&&x.id===companyForAccount(a)+'-HEDGE'&&x.status==='incompatible').map(x=>({id:x.id,status:'incompatible',reason:x.detail,source:x.url,checkedOn:G.rules.checked_on}));
  if(info.rulesIssues.length)info.rulesStatus='incompatible';
 }
 if(!r)info.pending.push('Faltan la modalidad y los límites actuales de tu cuenta para comprobar la viabilidad.');
 else{
  validateRisk(r,a);
  info.riskCurrent=r.company===companyForAccount(a)&&r.phase===a.phase&&r.asOfNodeId===a.nodeId&&r.asOfBalanceCents===a.balanceCents&&r.asOfDays===a.days&&new Date(r.checkedAt).toDateString()===new Date().toDateString();
  if(!info.riskCurrent)info.pending.push('Actualizá los límites: corresponden a otra fecha, saldo, día, etapa o posición.');
  else{
   info.modality=r.modality;info.limitsSource=r.source;info.limitsCheckedAt=r.checkedAt;
   const loss=sl?Math.max(0,-Math.round(sl.fund_net*100))+(r.extraFeeCents||0):null;
   if(info.projectedSLBalanceCents!==null)info.projectedSLBalanceCents-=r.extraFeeCents||0;
   if(r.floorCents===null)info.pending.push('Falta el límite de pérdida total vigente (piso real del drawdown).');
   else{
    info.remainingDrawdownCents=a.balanceCents-r.floorCents;
    if(a.balanceCents<=r.floorCents)info.reasons.push('Tu saldo '+usd(a.balanceCents)+' alcanza o está por debajo del piso '+usd(r.floorCents)+'.');
    else if(sl&&info.projectedSLBalanceCents<=r.floorCents)info.reasons.push('Con el SL original quedarían '+usd(info.projectedSLBalanceCents)+', alcanzando o superando el límite de pérdida '+usd(r.floorCents)+'.');
   }
   if(r.maxLossCents!==null&&loss!==null&&loss>r.maxLossCents)info.reasons.push('La pérdida prevista '+usd(loss)+' supera la pérdida máxima informada '+usd(r.maxLossCents)+'.');
   if(r.dailyLimitApplies!==false){
    if(r.dailyRemainingCents===null)info.pending.push('Falta el margen diario de pérdida; confirmá si esta modalidad no tiene límite diario.');
    else if(loss!==null&&loss>=r.dailyRemainingCents)info.reasons.push('El SL previsto '+usd(loss)+' alcanza o supera el margen diario restante '+usd(r.dailyRemainingCents)+'.');
   }
   if(n.kind==='operation'){
    if(r.maxContracts===null||r.instrument===null)info.pending.push('Falta confirmar el máximo de contratos y su instrumento.');
    else if(r.instrument!==n.controls[2])info.pending.push('El límite de contratos está expresado en '+r.instrument+' y la ruta usa '+n.controls[2]+'. Falta verificar la equivalencia permitida por la empresa.');
    else if(Number(n.controls[3])>r.maxContracts)info.reasons.push('La ruta usa '+n.controls[3]+' '+n.controls[2]+' y el máximo informado es '+r.maxContracts+'.');
   }
   if(r.targetBalanceCents===null)info.pending.push('Falta el saldo objetivo vigente de esta etapa o retiro.');
   else{info.targetRemainingCents=Math.max(0,r.targetBalanceCents-a.balanceCents);if(info.targetRemainingCents>0)info.notes.push('Faltan '+usd(info.targetRemainingCents)+' para el objetivo informado.');else info.notes.push('Objetivo de saldo alcanzado; no confirma aprobación ni retiro.');}
   if(r.minDays===null)info.pending.push('Falta el mínimo de días de esta etapa.');
   else{info.remainingDays=Math.max(0,r.minDays-a.days);if(info.remainingDays)info.notes.push('Faltan '+info.remainingDays+' días para el mínimo informado.');}
   if(r.consistencyPercent===null)info.pending.push('Falta confirmar la regla de consistencia (0 si no aplica).');
   else if(r.consistencyPercent>0){
    if(r.bestDayCents===null||r.cycleProfitCents===null)info.pending.push('Faltan el mejor día y la ganancia acumulada del ciclo real para revisar consistencia.');
    else if(r.cycleProfitCents<=0)info.notes.push('Sin ganancia positiva del ciclo, la consistencia para aprobación/retiro todavía no puede cumplirse.');
    else{info.consistencyActualPercent=r.bestDayCents/r.cycleProfitCents*100;if(info.consistencyActualPercent>r.consistencyPercent)info.notes.push('Consistencia: '+info.consistencyActualPercent.toFixed(2)+'%, por encima del '+r.consistencyPercent+'% informado; afecta aprobación/retiro.');}
   }
   if(r.feesConfirmed!==true||r.extraFeeCents===null)info.pending.push('Falta confirmar comisiones y costos adicionales (0 si no hay): el Excel ya incluye sus comisiones históricas.');
   if(hedged&&r.coverageAllowed===false)info.reasons.push('La configuración informada no permite esta cobertura contraria.');
   if(hedged&&r.coverageAllowed===null&&!info.rulesIssues.length)info.pending.push('Falta verificar si esta modalidad permite la cobertura contraria.');
   if(!info.rulesIssues.length)info.rulesStatus=hedged&&r.coverageAllowed!==true?'pending':'user_confirmed';
  }
 }
 if(n.kind==='terminal')info.notes.push('El Excel termina en este punto; el saldo real no crea una continuación ni confirma un retiro.');
 info.mathStatus=info.reasons.length?'not_viable':info.pending.length?'adaptation':'compatible';
 if(info.rulesIssues.length)info.reasons.push('La cobertura contraria de esta ruta tiene una incompatibilidad documentada con las reglas de '+companyForAccount(a)+'. Consultá su fuente; el seguimiento histórico continúa.');
 info.status=info.reasons.length?'not_viable':info.pending.length?'adaptation':'compatible';
 info.label={compatible:'Compatible con los límites informados',adaptation:'Requiere adaptación',not_viable:'No viable con estas condiciones'}[info.status];
 return info;
}
function branchAssessment(a,edge){
 const e=typeof edge==='string'?E[edge]:edge,n=N[a.nodeId];
 if(!e||!E[e.id]||E[e.id]!==e&&JSON.stringify(E[e.id])!==JSON.stringify(e)||e.from!==a.nodeId||!N[e.to]||!n||N[e.to].book!==a.book)throw Error('La rama no corresponde a la operación actual.');
 const base=assessment(a),fee=base.riskCurrent?(a.riskContext.extraFeeCents||0):0,projectedBalanceCents=a.balanceCents+Math.round(e.fund_net*100)-fee;
 return {...base,outcome:e.outcome,edgeId:e.id,nextNodeId:e.to,projectedBalanceCents,historicalNextBalanceCents:expectedBalance(N[e.to]),originalFundCents:Math.round(e.fund_net*100),extraFeeCents:fee,originalBrokerCents:Math.round(e.broker_net*100),continuationDocumented:N[e.to].kind==='operation'||!!N[e.to].transitions?.length,terminal:N[e.to].kind==='terminal',assessmentScope:'Viabilidad de la operación actual, no aprobación de la operación siguiente.',projectedTargetRemainingCents:base.riskCurrent&&a.riskContext.targetBalanceCents!==null?Math.max(0,a.riskContext.targetBalanceCents-projectedBalanceCents):null,projectedMarginToCurrentFloorCents:base.riskCurrent&&a.riskContext.floorCents!==null?projectedBalanceCents-a.riskContext.floorCents:null,projectionScope:'Saldo real actual + resultado neto original − costos adicionales informados; no cambia los parámetros del Excel. Después del resultado hay que verificar el piso y los límites vigentes de la nueva posición.'};
}
// A pending selection is an intention, never a trade or a speculative TP/SL edge.
const sameData=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function canonical(x){return Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x}
function operationConfiguration(n){
 const c=n.controls,contracts=c[3]===null||c[3]===''?NaN:Number(c[3]),hedge=c[8]===null||c[8]===''?NaN:Number(c[8]),weights={NQ:20,MNQ:2};
 const contractRatio=Number.isFinite(contracts)&&contracts>0&&Number.isFinite(hedge)&&hedge>=0?(-hedge/contracts||0):null;
 return {controls:clone(c),fundInstrument:c[2]??null,fundContracts:c[3]??null,takeProfitPips:c[4]??null,stopLossPips:c[5]??null,stopType:c[6]??null,coverageInstrument:c[7]??null,coverageContracts:c[8]??null,coverageSide:hedge>0?'opposite':null,contractRatio,monetaryRatio:contractRatio!==null&&weights[c[2]]&&weights[c[7]]?contractRatio*weights[c[7]]/weights[c[2]]:null,replikantoRatio:null};
}
function pendingOptions(a){
 if(a.archivedAt||!eligibility(a).ok)return [];
 const n=N[a.nodeId];
 // A phase transition needs its existing explicit phase/balance confirmation first.
 return n?.kind==='operation'?[{nodeId:n.id,label:op(n),phase:context(n).phase,stage:n.stage,contextId:n.context,sources:clone(n.sources||[])}]:[];
}
// A single historical unlinked trade can offer its documented successor for explicit confirmation.
// Multiple unlinked trades are ambiguous: never replay them or rewrite their money/history.
function resumeInfo(a){
 const result=status=>({status,resultId:null,from:null,to:null,outcome:null,edgeId:null});
 if(!trackingUnresolved(a))return result('none');
 if(a.archivedAt||a.status!=='activa'||a.blockedOutcome||!a.historyConfirmed)return result('ambiguous');
 const events=a.events||[];
 let anchor=-1;
 for(let i=0;i<events.length;i++){
  const ev=events[i];
  if((['route','phase'].includes(ev.kind)||ev.kind==='replica'&&['initial','route','phase'].includes(ev.reason))&&ev.trackingNeedsReview!==true)anchor=i;
 }
 if(anchor<0)return result('ambiguous');
 const tail=events.slice(anchor+1),unlinked=tail.filter(ev=>ev.kind==='result'&&['TP','SL'].includes(ev.outcome)&&!ev.to);
 if(unlinked.length!==1||tail.some(ev=>ev.kind==='replica'&&ev.reason!=='correction'||ev.kind==='result'&&['BE','BURN'].includes(ev.outcome)))return result('ambiguous');
 const ev=unlinked[0],index=tail.indexOf(ev);
 if(tail.slice(index+1).some(e=>['result','replica','route','phase'].includes(e.kind)))return result('ambiguous');
 const from=N[ev.from],edge=from&&E[from.outcomes?.[ev.outcome]],to=edge&&N[edge.to];
 if(!from||from.kind!=='operation'||a.nodeId!==from.id||from.book!==a.book||context(from)?.phase!==a.phase||ev.phase!==a.phase||!to||edge.from!==from.id||to.book!==a.book||context(to)?.phase!==a.phase)return result('ambiguous');
 return {status:'available',resultId:ev.id,from:from.id,to:to.id,outcome:ev.outcome,edgeId:edge.id};
}
function resumeContinuation(a,resultId,options={}){
 openAccount(a);const info=resumeInfo(a);
 if(info.status!=='available'||info.resultId!==resultId)throw Error('La continuación cambió o necesita revisar la posición. No se modificó tu cuenta.');
 const accounts=options.accounts===undefined?1:options.accounts;
 if(!Number.isInteger(accounts)||accounts<1||accounts>10000)throw Error('La cantidad de cuentas debe ser un entero entre 1 y 10000.');
 const next=clone(a);bind(next,info.to,true);
 Object.assign(next.events.at(-1),{reason:'resume_after_result',resultId:info.resultId});
 if(N[info.to].kind==='operation')selectPending(next,info.to,{accounts});
 validatePendingHistory(next);Object.assign(a,next);return a;
}
function validateSelection(s,a){
 if(!s||typeof s!=='object'||Array.isArray(s)||typeof s.id!=='string'||!/^[A-Za-z0-9_.:-]+$/.test(s.id)||s.status!=='pending'||s.accountId!==a.id||s.company!==companyForAccount(a)||s.book!==a.book||typeof s.selectedAt!=='string'||!Number.isFinite(Date.parse(s.selectedAt)))throw Error('Selección pendiente no válida.');
 text(s.accountNumber,'Número de la selección',80);if(s.modality!==null)text(s.modality,'Modalidad de la selección',120);
 const n=N[s.nodeId];
 if(!n||n.kind!=='operation'||n.book!==a.book||s.phase!==context(n).phase||s.contextId!==n.context||s.contextLabel!==context(n).label||s.stage!==n.stage||s.operationDay!==(n.session??n.controls[0]??n.history.length+1)||s.historicalBalanceCents!==expectedBalance(n)||!sameData(s.configuration,operationConfiguration(n))||!sameData(s.sources,n.sources||[]))throw Error('La configuración pendiente no coincide con su ruta original.');
 if(!Number.isInteger(s.ratioAccounts)||s.ratioAccounts<1||s.ratioAccounts>10000||s.ratioTotalContract!==(s.configuration.contractRatio===null?null:s.configuration.contractRatio*s.ratioAccounts)||s.ratioTotalMonetary!==(s.configuration.monetaryRatio===null?null:s.configuration.monetaryRatio*s.ratioAccounts))throw Error('Ratio de selección no válido.');
 if(!Number.isSafeInteger(s.asOfBalanceCents)||s.asOfBalanceCents<0||s.asOfBalanceCents>1e12||!Number.isInteger(s.asOfDays)||s.asOfDays<0||s.asOfDays>10000)throw Error('Estado de selección no válido.');
 return s;
}
function pendingRoute(a){
 const s=a.pendingRoute;if(!s)return {status:'none',selection:null,reasons:[]};validateSelection(s,a);
 const reasons=[];
 if(a.archivedAt)reasons.push('La cuenta está en la papelera.');
 if(a.nodeId!==s.nodeId||a.phase!==s.phase)reasons.push('La posición actual cambió después de esta selección.');
 if(!eligibility(a).ok)reasons.push(...eligibility(a).reasons);
 return {status:reasons.length?'stale':'pending',selection:clone(s),reasons};
}
function selectPending(a,nodeId,options={}){
 openAccount(a);if(!pendingOptions(a).some(x=>x.nodeId===nodeId))throw Error('Esa ruta no es una continuación documentada disponible para esta cuenta.');
 const accounts=options.accounts===undefined?1:options.accounts;if(!Number.isInteger(accounts)||accounts<1||accounts>10000)throw Error('La cantidad de cuentas debe ser un entero entre 1 y 10000.');
 const current=pendingRoute(a);if(current.status==='pending'&&current.selection.nodeId===nodeId&&current.selection.ratioAccounts===accounts)return a;
 const n=N[nodeId],at=new Date().toISOString(),previous=a.pendingRoute?.id||null;
 const selection={id:id(),status:'pending',accountId:a.id,accountNumber:a.number,company:companyForAccount(a),book:a.book,modality:a.riskContext?.modality||a.firm||null,nodeId,phase:a.phase,stage:n.stage,contextId:n.context,contextLabel:context(n).label,operationDay:n.session??n.controls[0]??n.history.length+1,selectedAt:at,asOfBalanceCents:a.balanceCents,asOfDays:a.days,historicalBalanceCents:expectedBalance(n),configuration:operationConfiguration(n),sources:clone(n.sources||[])};
 selection.ratioAccounts=accounts;selection.ratioTotalContract=selection.configuration.contractRatio===null?null:selection.configuration.contractRatio*accounts;selection.ratioTotalMonetary=selection.configuration.monetaryRatio===null?null:selection.configuration.monetaryRatio*accounts;
 validateSelection(selection,a);
 a.events.push({id:id(),kind:'selection',action:'selected',at,phase:a.phase,balanceCents:a.balanceCents,days:a.days,from:a.nodeId,to:nodeId,selectionId:selection.id,previousSelectionId:previous,selection:clone(selection)});a.pendingRoute=selection;return a;
}
function clearPending(a,reason='cancelled'){
 if(!a.pendingRoute)return a;
 if(!['cancelled','invalidated'].includes(reason))throw Error('Motivo de selección no válido.');
 const selectionId=a.pendingRoute.id;
 a.events.push({id:id(),kind:'selection',action:reason,at:new Date().toISOString(),phase:a.phase,balanceCents:a.balanceCents,days:a.days,from:a.nodeId,to:a.nodeId,selectionId,previousSelectionId:selectionId});a.pendingRoute=null;return a;
}
function cancelPending(a){openAccount(a);return clearPending(a,'cancelled')}
function validatePendingHistory(a){
 let active=null,position=null;const used=new Set();
 for(const ev of a.events){
  if(ev.kind==='selection'){
   if(!['selected','cancelled','invalidated'].includes(ev.action)||typeof ev.selectionId!=='string')throw Error('Decisión de ruta no válida.');
   if(ev.action==='selected'){
    const s=validateSelection(ev.selection,a);
    if(used.has(s.id)||ev.selectionId!==s.id||ev.previousSelectionId!==(active?.id||null)||s.selectedAt!==ev.at||s.asOfBalanceCents!==ev.balanceCents||s.asOfDays!==ev.days||s.phase!==ev.phase||ev.from!==position||ev.to!==position||s.nodeId!==position)throw Error('La selección no corresponde a la posición de la cuenta.');
    used.add(s.id);active=s;
   }else{
    if(!active||ev.selectionId!==active.id||ev.previousSelectionId!==active.id||ev.from!==position||ev.to!==position||ev.selection!==undefined)throw Error('La selección anterior no coincide.');active=null;
   }
   continue;
  }
  if(ev.pendingSelectionId!==undefined){
   if(!active||ev.pendingSelectionId!==active.id||ev.from!==active.nodeId||!(ev.kind==='result'||ev.kind==='replica'&&ev.reason==='result'))throw Error('La operación no corresponde a su ruta pendiente.');active=null;
  }
  if(ev.kind==='result'||ev.kind==='replica'&&ev.reason==='result'){
   if(active)throw Error('La operación realizada debe cerrar su selección pendiente.');
   position=ev.to||ev.from||position;
  }else if(['route','phase'].includes(ev.kind)||ev.kind==='replica'&&ev.reason!=='correction'){
   if(active&&ev.to!==active.nodeId)throw Error('El cambio de posición debe conservar el cierre de la selección anterior.');position=ev.to||null;
  }
 }
 if(active){if(!a.pendingRoute||!sameData(a.pendingRoute,active)||a.pendingRoute.nodeId!==a.nodeId||a.pendingRoute.phase!==a.phase)throw Error('La ruta pendiente no coincide con el historial de decisiones.');}
 else if(a.pendingRoute!==undefined&&a.pendingRoute!==null)throw Error('La ruta pendiente no tiene una selección guardada.');
}
function candidates(a){return Object.values(N).filter(n=>n.book===a.book&&context(n).phase===a.phase&&expectedBalance(n)===a.balanceCents&&expectedDays(n)===a.days)}
function create(){return {app:'rutas-cuentas',schema:2,revision:0,selected:null,identities:[]}}
function newIdentity(db,name){name=text(name,'Nombre de identidad',80);if(db.identities.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Ya existe una identidad con ese nombre.');const p={id:id(),name,accounts:[],groups:[]};db.identities.push(p);return p}
function newAccount(db,pid,data){const p=db.identities.find(x=>x.id===pid);if(!p)throw Error('Elegí una identidad.');const number=text(data.number,'Número de cuenta',80);if(p.accounts.some(a=>!a.archivedAt&&a.number.toLocaleLowerCase()===number.toLocaleLowerCase()&&companyForBook(a.book)===companyForBook(data.book)))throw Error('Ese número de cuenta ya existe en esta identidad y empresa.');if(data.company&&data.company!==companyForBook(data.book))throw Error('La estrategia no pertenece a la empresa elegida.');if(!G.summary.base_books.some(b=>b.file===data.book)||!['eval','funded'].includes(data.phase))throw Error('Elegí Excel y etapa.');const a={id:id(),number,firm:String(data.firm||'').trim().slice(0,80),book:data.book,phase:data.phase,balanceCents:moneyInput(data.balance),days:days(data.days),status:'activa',nodeId:null,historyConfirmed:false,diverged:false,blockedOutcome:null,events:[],isDemo:!!data.isDemo};p.accounts.push(a);db.selected=a.id;a.events.push({id:id(),kind:'created',at:new Date().toISOString(),balanceCents:a.balanceCents,days:a.days,phase:a.phase});return a}
function bind(a,nodeId,confirmed){openAccount(a);const n=N[nodeId];if(!n||n.book!==a.book||context(n).phase!==a.phase)throw Error('La ruta no pertenece al Excel y etapa de esta cuenta.');if(confirmed!==true)throw Error('Confirmá que la historia elegida coincide con tus operaciones.');if(a.status==='quemada')throw Error('Una cuenta quemada no puede reactivarse vinculando otra ruta. Agregá la cuenta nueva por separado.');const previous=a.nodeId;if(a.pendingRoute&&a.pendingRoute.nodeId!==nodeId)clearPending(a,'invalidated');a.nodeId=nodeId;a.historyConfirmed=true;a.blockedOutcome=null;a.diverged=mismatch(a,n).length>0;a.events.push({id:id(),kind:'route',at:new Date().toISOString(),from:previous,to:nodeId,historyConfirmed:true,balanceCents:a.balanceCents,days:a.days,phase:a.phase});return a}
function update(a,balance,day,notes=''){openAccount(a);const cents=moneyInput(balance),d=days(day);const event={id:id(),kind:'balance',at:new Date().toISOString(),beforeBalance:a.balanceCents,balanceCents:cents,beforeDays:a.days,days:d,phase:a.phase,note:String(notes).slice(0,400)};a.balanceCents=cents;a.days=d;if(a.nodeId&&mismatch(a,N[a.nodeId]).length)a.diverged=true;a.events.push(event);return a}
function record(a,outcome,balance,day){openAccount(a);if(!['TP','SL','BURN','BE'].includes(outcome))throw Error('Resultado no válido.');if(a.status==='quemada')throw Error('Esta cuenta está marcada como quemada.');const cents=moneyInput(balance),d=days(day);if(d<a.days)throw Error('Los días operados no pueden retroceder al registrar un resultado. Usá Corregir estado.');if(['TP','SL'].includes(outcome)&&trackingUnresolved(a))throw Error('Guardá la próxima operación documentada o revisá la posición antes de registrar otro resultado.');const validBefore=eligibility(a).ok,n=a.nodeId&&N[a.nodeId];if(validBefore&&n.kind==='terminal'&&!['BURN','BE'].includes(outcome))throw Error('Este recorrido terminó. Usá el paso de fase documentado o revisá la posición.');const edge=validBefore&&E[n.outcomes?.[outcome]];if(a.pendingRoute&&(a.pendingRoute.nodeId!==a.nodeId||a.pendingRoute.phase!==a.phase))clearPending(a,'invalidated');const pendingSelectionId=a.pendingRoute?.id||null;const ev={id:id(),kind:'result',at:new Date().toISOString(),outcome,from:a.nodeId,to:edge?edge.to:null,beforeBalance:a.balanceCents,balanceCents:cents,beforeDays:a.days,days:d,phase:a.phase,actualFundCents:cents-a.balanceCents,projectedBalanceCents:edge?a.balanceCents+Math.round(edge.fund_net*100):null,historicalBalanceCents:edge?expectedBalance(N[edge.to]):null,referenceFundCents:edge?Math.round(edge.fund_net*100):null,referenceBrokerCents:edge?Math.round(edge.broker_net*100):null};a.balanceCents=cents;a.days=d;if(edge){a.nodeId=edge.to;a.diverged=mismatch(a,N[edge.to]).length>0}else{a.diverged=true;if(outcome==='BURN'||outcome==='BE')a.blockedOutcome=outcome}if(outcome==='BURN')a.status='quemada';if(pendingSelectionId)ev.pendingSelectionId=pendingSelectionId;a.events.push(ev);if(a.pendingRoute)a.pendingRoute=null;return a}
function enterFunded(a,balance,day){openAccount(a);if(!eligibility(a).ok)throw Error('Primero revisá la posición de la cuenta.');const n=N[a.nodeId],transition=n.transitions?.[0];if(!transition)throw Error('No hay una entrada a funded documentada.');const cents=moneyInput(balance),d=days(day),from=a.nodeId;clearPending(a,'invalidated');a.phase='funded';a.nodeId=transition.to;a.balanceCents=cents;a.days=d;a.diverged=mismatch(a,N[a.nodeId]).length>0;a.events.push({id:id(),kind:'phase',at:new Date().toISOString(),from,to:a.nodeId,balanceCents:cents,days:d,phase:'funded'});return a}
const mirroredFields=['balanceCents','days','phase','status','nodeId','historyConfirmed','diverged','blockedOutcome'];
function groupFor(db,aid){for(const p of db.identities){const g=(p.groups||[]).find(g=>g.motherId===aid||g.followerIds.includes(aid));if(g)return {identity:p,group:g,mother:account(db,g.motherId),followers:g.followerIds.map(x=>account(db,x))}}return null}
function atomic(db,fn){const next=clone(db),result=fn(next),valid=validate(next);Object.assign(db,valid);return result}
function parseNumbers(value){if(typeof value!=='string')throw Error('Ingresá los números de cuenta.');const values=value.split(/[,;\n]+/).map(v=>v.trim()).filter(Boolean);if(!values.length||values.length>100)throw Error('Ingresá entre 1 y 100 números de cuenta, separados por comas.');values.forEach(v=>text(v,'Número de cuenta',80));if(new Set(values.map(v=>v.toLocaleLowerCase())).size!==values.length)throw Error('Hay números de cuenta repetidos.');return values}
function copyState(target,mother,group,reason){
 if(target.book!==mother.book)throw Error('Las réplicas deben seguir el mismo Excel.');
 if(target.status==='quemada'&&mother.status!=='quemada')throw Error('La cuenta '+target.number+' está quemada. Desvinculala antes de replicar; su historial se conserva.');
 const before={balanceCents:target.balanceCents,days:target.days,phase:target.phase,nodeId:target.nodeId,status:target.status};
 const source=mother.events.at(-1);
 let consumedSelectionId=null;
 if(target.pendingRoute&&reason==='result'&&source.from===target.pendingRoute.nodeId&&before.phase===target.pendingRoute.phase)consumedSelectionId=target.pendingRoute.id;
 else if(target.pendingRoute&&reason!=='correction'&&(reason==='result'||target.pendingRoute.nodeId!==mother.nodeId||target.pendingRoute.phase!==mother.phase||mother.status==='quemada'))clearPending(target,'invalidated');
 if(reason==='correction'){
  if(target.phase!==mother.phase)throw Error('No se pueden copiar datos entre etapas distintas. Aplicá la corrección solo a la madre.');
  target.balanceCents=mother.balanceCents;target.days=mother.days;
  if(target.nodeId&&mismatch(target,N[target.nodeId]).length)target.diverged=true;
 }else mirroredFields.forEach(k=>target[k]=clone(mother[k]));
 // `from` preserves the follower's position before synchronization; the trade can originate at a different node.
 target.events.push({id:id(),kind:'replica',at:new Date().toISOString(),phase:target.phase,balanceCents:target.balanceCents,days:target.days,from:before.nodeId,to:target.nodeId,beforeBalance:before.balanceCents,beforeDays:before.days,beforePhase:before.phase,beforeStatus:before.status,sourceAccountId:mother.id,sourceNumber:mother.number,sourceEventId:source.id,groupId:group.id,reason,outcome:reason==='result'?source.outcome:null,trackingNeedsReview:!eligibility(mother).ok,...(reason==='result'?{operationNodeId:source.from,actualFundCents:source.actualFundCents??source.balanceCents-source.beforeBalance}:{}),...(consumedSelectionId?{pendingSelectionId:consumedSelectionId}:{})});
 if(consumedSelectionId)target.pendingRoute=null;
}
function configureGroup(db,pid,motherId,followerIds,existingId=null){return atomic(db,next=>{
 const p=next.identities.find(p=>p.id===pid);if(!p)throw Error('Elegí una identidad.');p.groups=p.groups||[];
 if(!Array.isArray(followerIds)||!followerIds.length||new Set(followerIds).size!==followerIds.length||followerIds.includes(motherId))throw Error('Elegí una madre y al menos una réplica distinta.');
 const members=[motherId,...followerIds].map(aid=>p.accounts.find(a=>a.id===aid));if(members.some(a=>!a))throw Error('Todas las cuentas deben pertenecer a la misma identidad.');const mother=members[0];
 if(existingId&&!p.groups.some(g=>g.id===existingId))throw Error('No se encontró el grupo.');
 if(members.some(a=>a.archivedAt))throw Error('Restaurá las cuentas antes de vincularlas.');
 if(members.some(a=>a.status==='quemada'))throw Error('No se pueden vincular cuentas quemadas. Cargá las cuentas nuevas por separado.');
 if(members.some(a=>a.book!==mother.book||a.phase!==mother.phase||a.isDemo!==mother.isDemo))throw Error('Elegí cuentas del mismo Excel, etapa, empresa y tipo de ejemplo.');
 if(p.groups.some(g=>g.id!==existingId&&[g.motherId,...g.followerIds].some(aid=>[motherId,...followerIds].includes(aid))))throw Error('Una de estas cuentas ya pertenece a otro grupo.');
 const group={id:existingId||id(),motherId,followerIds:[...followerIds]};p.groups=p.groups.filter(g=>g.id!==existingId);p.groups.push(group);
 members.slice(1).forEach(a=>copyState(a,mother,group,'initial'));next.selected=motherId;return group.id;
})}
function newBatch(db,pid,data,numbersValue,motherNumber){return atomic(db,next=>{
 const numbers=parseNumbers(numbersValue),mother=text(motherNumber||numbers[0],'Cuenta madre',80);if(!numbers.includes(mother))throw Error('La madre debe ser uno de los números que ingresaste.');
 const members=numbers.map(number=>newAccount(next,pid,{...data,number})),m=members.find(a=>a.number===mother);
 if(members.length>1)configureGroup(next,pid,m.id,members.filter(a=>a.id!==m.id).map(a=>a.id));next.selected=m.id;return m.id;
})}
function operate(db,aid,action,payload={},replicate=true){return atomic(db,next=>{
 const a=openAccount(account(next,aid)),info=groupFor(next,aid),targets=replicate&&info?.mother.id===aid&&!['selectPending','cancelPending'].includes(action)?info.followers:[];
 if(targets.some(t=>t.status==='quemada')&&a.status!=='quemada')throw Error('El grupo tiene una réplica quemada. Desvinculala o aplicá el cambio solo a la madre.');
 if(action==='selectPending')selectPending(a,payload.nodeId,{accounts:payload.accounts});
 else if(action==='cancelPending')cancelPending(a);
 else if(action==='bind')bind(a,payload.nodeId,payload.confirmed);
 else if(action==='update')update(a,payload.balance,payload.days,payload.note);
 else if(action==='record')record(a,payload.outcome,payload.balance,payload.days);
 else if(action==='funded')enterFunded(a,payload.balance,payload.days);
 else if(action!=='sync')throw Error('Acción de réplica no válida.');
 if(action==='sync'&&(!info||info.mother.id!==aid))throw Error('Elegí la cuenta madre para replicar.');
 const reason={bind:'route',update:'correction',record:'result',funded:'phase',sync:'sync'}[action];targets.forEach(t=>copyState(t,a,info.group,reason));return 1+targets.length;
})}
function detachGroup(db,pid,gid){return atomic(db,next=>{const p=next.identities.find(p=>p.id===pid);if(!p?.groups?.some(g=>g.id===gid))throw Error('No se encontró el grupo.');p.groups=p.groups.filter(g=>g.id!==gid)})}
function openAccount(a){if(a.archivedAt)throw Error('Esta cuenta está en la papelera. Restaurala antes de usarla.');return a}
function archiveAccount(db,aid,confirmed=false){return atomic(db,next=>{
 if(confirmed!==true)throw Error('Confirmá que querés eliminar esta cuenta.');const a=openAccount(account(next,aid)),info=groupFor(next,aid);
 if(info){const p=info.identity,g=info.group;if(g.motherId===aid)p.groups=p.groups.filter(x=>x.id!==g.id);else{g.followerIds=g.followerIds.filter(x=>x!==aid);if(!g.followerIds.length)p.groups=p.groups.filter(x=>x.id!==g.id)}}
 a.archivedAt=new Date().toISOString();a.events.push({id:id(),kind:'archive',at:a.archivedAt,balanceCents:a.balanceCents,days:a.days,phase:a.phase});
 if(next.selected===aid){next.selected=null;next.view='identities'}for(const co of Object.keys(next.lastAccounts||{}))if(next.lastAccounts[co]===aid)next.lastAccounts[co]=null;
})}
function restoreAccount(db,aid){return atomic(db,next=>{const a=account(next,aid),p=next.identities.find(p=>p.accounts.some(x=>x.id===aid));if(!a.archivedAt)throw Error('Esta cuenta ya está activa.');if(p.accounts.some(x=>x.id!==aid&&!x.archivedAt&&companyForAccount(x)===companyForAccount(a)&&x.number.toLocaleLowerCase()===a.number.toLocaleLowerCase()))throw Error('Ya hay una cuenta activa con ese número. Separá esa cuenta antes de restaurar esta.');a.archivedAt=null;a.events.push({id:id(),kind:'restore',at:new Date().toISOString(),balanceCents:a.balanceCents,days:a.days,phase:a.phase});next.selected=aid;next.view='home';})}
function renameIdentity(db,pid,name){return atomic(db,next=>{const p=next.identities.find(p=>p.id===pid);if(!p)throw Error('Identidad no encontrada.');name=text(name,'Nombre',80);if(next.identities.some(x=>x.id!==pid&&x.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('Ya existe otra identidad con ese nombre.');if(name===p.name)return;const previous=p.name;p.name=name;p.edits=p.edits||[];p.edits.push({at:new Date().toISOString(),before:previous,name})})}
function editAccountDetails(db,aid,data){return atomic(db,next=>{
 const a=openAccount(account(next,aid)),p=next.identities.find(p=>p.accounts.some(x=>x.id===aid)),dest=next.identities.find(p=>p.id===(data.identityId||p.id));
 if(!dest)throw Error('Elegí la identidad de la cuenta.');
 const number=text(data.number,'Número de cuenta',80),book=data.book||a.book,phase=data.phase||a.phase;
 if(book!==a.book||phase!==a.phase||(data.status&&data.status!==a.status))throw Error('La edición de datos no permite modificar la estrategia, etapa ni resultado de la ruta.');
 if(!bookInfo(book)||!['eval','funded'].includes(phase)||data.company&&data.company!==companyForBook(book))throw Error('Empresa, estrategia o etapa no válidas.');
 if(dest.accounts.some(x=>x.id!==aid&&!x.archivedAt&&companyForBook(x.book)===companyForBook(book)&&x.number.toLocaleLowerCase()===number.toLocaleLowerCase()))throw Error('Ya existe esa cuenta en esta identidad y empresa.');
 const cents=moneyInput(data.balance),d=days(data.days),status=a.status,note=String(data.note||'').trim().slice(0,400);
 const move=p.id!==dest.id,group=groupFor(next,aid),stateChanged=cents!==a.balanceCents||d!==a.days;
 if(group&&move){if(data.detach!==true)throw Error('Confirmá separar esta cuenta del grupo para aplicar estos cambios.');if(group.group.motherId===aid){p.groups=p.groups.filter(g=>g.id!==group.group.id)}else{group.group.followerIds=group.group.followerIds.filter(id=>id!==aid);if(!group.group.followerIds.length)p.groups=p.groups.filter(g=>g.id!==group.group.id)}}
 const before={number:a.number,book:a.book,phase:a.phase,identityId:p.id,status:a.status,balanceCents:a.balanceCents,days:a.days,nodeId:a.nodeId};
 // Preserve source attribution and every previous event. Routes are never edited here.
 a.events.forEach(e=>{if(e.book===undefined&&e.kind!=='selection')e.book=a.book});
 a.number=number;a.balanceCents=cents;a.days=d;
 if(stateChanged&&a.nodeId&&mismatch(a,N[a.nodeId]).length)a.diverged=true;
 if(move){p.accounts=p.accounts.filter(x=>x.id!==aid);dest.accounts.push(a)}
 a.events.push({id:id(),kind:'details',at:new Date().toISOString(),book,phase,number,identityId:dest.id,balanceCents:cents,days:d,status,note,before,routeNeedsReview:false});
 if(data.replicate===true&&stateChanged&&group?.mother.id===aid&&!move)group.followers.forEach(t=>copyState(t,a,group.group,'correction'));
 next.selected=aid;return {moved:move};
})}

const cashKinds={initial:['Inversión inicial / compra de cuentas',-1],rebuy:['Recompra de cuentas',-1],evaluation:['Costo de evaluación',-1],funded:['Costo de funded / activación',-1],fee:['Comisión pagada por separado',-1],broker_gain:['Ganancia real neta del bróker',1],broker_loss:['Pérdida real neta del bróker',-1],payout:['Retiro de fondeo efectivamente cobrado',1],refund:['Reembolso cobrado',1]};
function cashValidate(db){
 if(db.ledger===undefined)return;
 if(!Array.isArray(db.ledger)||db.ledger.length>20000)throw Error('Movimientos de dinero no válidos.');
 const seen=new Map(),reversed=new Set();
 for(const e of db.ledger){
  if(!e||typeof e.id!=='string'||!/^[A-Za-z0-9_.:-]+$/.test(e.id)||seen.has(e.id)||!companies.some(c=>c.id===e.company)||!Object.hasOwn(cashKinds,e.category)||!Number.isSafeInteger(e.amountCents)||e.amountCents<=0||e.amountCents>1e12||typeof e.note!=='string'||e.note.length>400||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))||typeof e.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||new Date(e.date+'T12:00:00Z').toISOString().slice(0,10)!==e.date)throw Error('Movimiento de dinero no válido.');
  if(e.accountId!==null){const a=account(db,e.accountId);if(companyForAccount(a)!==e.company||a.isDemo)throw Error('El movimiento no pertenece a una cuenta real de esa empresa.');}
  if(e.reversalOf){const source=seen.get(e.reversalOf);if(!source||source.reversalOf||reversed.has(source.id)||['company','accountId','category','amountCents'].some(k=>source[k]!==e[k]))throw Error('Corrección de dinero no válida.');reversed.add(source.id)}
  seen.set(e.id,e);
 }
}
function cashAdd(db,data){return atomic(db,next=>{
 const company=data.company,accountId=data.accountId||null;if(!companies.some(c=>c.id===company)||!Object.hasOwn(cashKinds,data.category))throw Error('Elegí empresa y tipo de movimiento.');
 const entry={id:id(),company,accountId,category:data.category,amountCents:moneyInput(data.amount),date:data.date||new Date().toISOString().slice(0,10),note:String(data.note||'').trim().slice(0,400),at:new Date().toISOString()};
 next.ledger=next.ledger||[];
 if(data.replaces){const prior=next.ledger.find(e=>e.id===data.replaces);if(!prior||prior.reversalOf||next.ledger.some(e=>e.reversalOf===prior.id))throw Error('Este movimiento ya fue corregido.');next.ledger.push({...prior,id:id(),at:entry.at,date:entry.date,reversalOf:prior.id,note:'Corrección: '+entry.note.slice(0,380)})}
 next.ledger.push(entry);cashValidate(next);return entry.id;
})}
function cashVoid(db,eid,confirmed){if(confirmed!==true)throw Error('Confirmá anular este movimiento.');return atomic(db,next=>{const e=next.ledger?.find(e=>e.id===eid);if(!e||e.reversalOf||next.ledger.some(x=>x.reversalOf===eid))throw Error('Movimiento ya anulado o inexistente.');next.ledger.push({...e,id:id(),at:new Date().toISOString(),date:new Date().toISOString().slice(0,10),reversalOf:e.id,note:'Movimiento anulado por el usuario'});cashValidate(next)})}
function cashSummary(db,company,accountId=null){
 const entries=(db.ledger||[]).filter(e=>(!company||e.company===company)&&(!accountId||e.accountId===accountId));
 const totals={out:0,in:0,broker:0,payout:0,cost:0,initial:0,rebuy:0};
 for(const e of entries){const value=e.amountCents*(e.reversalOf?-1:1),sign=cashKinds[e.category][1];totals[sign===1?'in':'out']+=value;if(e.category.startsWith('broker_'))totals.broker+=value*sign;else if(e.category==='payout')totals.payout+=value;else if(sign===-1)totals.cost+=value;if(e.category==='initial')totals.initial+=value;if(e.category==='rebuy')totals.rebuy+=value;}
 if(Object.values(totals).some(v=>!Number.isSafeInteger(v)))throw Error('El total supera el rango admitido.');
 return {...totals,net:totals.in-totals.out,pending:Math.max(0,totals.out-totals.in),recovered:Math.min(totals.out,totals.in),roi:totals.out?((totals.in-totals.out)/totals.out)*100:null,entries};
}

function simulationParameters(p){
 if(!p||typeof p!=='object')throw Error('Parámetros de simulación no válidos.');
 for(const k of ['accounts','contracts','hedge'])if(!Number.isSafeInteger(p[k])||p[k]<(k==='hedge'?0:1)||p[k]>1000)throw Error('Cantidad de cuentas o contratos no válida.');
 for(const k of ['tp','sl','fundPip','brokerPip','fundFee','brokerFee','investment'])if(typeof p[k]!=='number'||!Number.isFinite(p[k])||p[k]<0||p[k]>1e7||(['tp','sl','fundPip','brokerPip'].includes(k)&&p[k]===0))throw Error('Distancia, costo o inversión no válidos.');
 return p;
}
function simulationMoney(p,outcome){simulationParameters(p);if(!['TP','SL'].includes(outcome))throw Error('Resultado no válido.');const distance=outcome==='TP'?p.tp:p.sl,sign=outcome==='TP'?1:-1;const fundCents=Math.round((sign*distance*p.fundPip*p.contracts-p.fundFee*p.contracts)*100),brokerCents=Math.round((-sign*distance*p.brokerPip*p.hedge-p.brokerFee*p.hedge)*100)||0;const result={fundCents:fundCents||0,brokerCents,groupFundCents:fundCents*p.accounts||0,groupBrokerCents:brokerCents*p.accounts||0};if(Object.values(result).some(v=>!Number.isSafeInteger(v)))throw Error('Los parámetros superan el rango monetario admitido.');return result;}
function newSimulation(db,nodeId,parameters,name){return atomic(db,next=>{if(!N[nodeId]||N[nodeId].kind!=='operation')throw Error('Elegí una operación de origen.');simulationParameters(parameters);const s={id:id(),name:String(name||'Simulación personalizada').trim().slice(0,80),createdAt:new Date().toISOString(),start:nodeId,parameters:clone(parameters),steps:[]};next.simulations=next.simulations||[];if(next.simulations.length>=500)throw Error('El límite es de 500 simulaciones. Exportá un respaldo.');next.simulations.push(s);return s.id;})}
function simulationState(s){
 const start=N[s.start];let node=start,fundProfitCents=Math.round(start.state.fund_profit*100),cashCents=-Math.round(s.parameters.investment*100),matches=true,stopped=null;
 for(const step of s.steps){if(!node||node.kind!=='operation'||stopped)throw Error('Secuencia de simulación no válida.');if(['BURN','BE'].includes(step.outcome)){stopped=step.outcome;continue}const e=E[node.outcomes[step.outcome]],m=simulationMoney(s.parameters,step.outcome);if(!e)throw Error('La rama no existe en el Excel.');fundProfitCents+=m.fundCents;cashCents+=m.groupBrokerCents;matches=matches&&s.parameters.contracts===Number(node.controls[3])&&s.parameters.hedge===Number(node.controls[8])&&s.parameters.tp===Number(node.controls[4])&&s.parameters.sl===Number(node.controls[5])&&m.fundCents===Math.round(e.fund_net*100)&&m.brokerCents===Math.round(e.broker_net*100);node=N[e.to];}
 if(!Number.isSafeInteger(fundProfitCents)||!Number.isSafeInteger(cashCents))throw Error('La simulación supera el rango monetario admitido.');
 return {node,fundProfitCents,cashCents,matches,stopped,pendingCents:Math.max(0,-cashCents)};
}
function stepSimulation(db,sid,outcome){return atomic(db,next=>{const s=next.simulations?.find(x=>x.id===sid);if(!s)throw Error('Simulación no encontrada.');const current=simulationState(s);if(current.stopped||current.node.kind!=='operation')throw Error('No hay continuación de operaciones documentada.');if(!['TP','SL','BURN','BE'].includes(outcome))throw Error('Resultado no válido.');s.steps.push({outcome,at:new Date().toISOString()});simulationState(s);})}
function forkSimulation(db,sid,stepCount){return atomic(db,next=>{const s=next.simulations?.find(x=>x.id===sid);if(!s||!Number.isInteger(stepCount)||stepCount<0||stepCount>s.steps.length)throw Error('Punto de simulación no válido.');const copy={...clone(s),id:id(),name:(s.name+' · copia').slice(0,80),createdAt:new Date().toISOString(),parentId:s.id,steps:s.steps.slice(0,stepCount)};next.simulations.push(copy);return copy.id;})}
function validateSimulations(db){if(db.simulations===undefined)return;if(!Array.isArray(db.simulations)||db.simulations.length>500)throw Error('Simulaciones no válidas.');const used=new Set();for(const s of db.simulations){if(!s||typeof s.id!=='string'||!/^[A-Za-z0-9_.:-]+$/.test(s.id)||used.has(s.id)||typeof s.name!=='string'||s.name.length>80||!N[s.start]||N[s.start].kind!=='operation'||!Array.isArray(s.steps)||s.steps.length>5000||!Number.isFinite(Date.parse(s.createdAt)))throw Error('Simulación no válida.');used.add(s.id);simulationParameters(s.parameters);for(const step of s.steps)if(!['TP','SL','BE','BURN'].includes(step.outcome)||!Number.isFinite(Date.parse(step.at)))throw Error('Resultado simulado no válido.');simulationState(s);}}

function validate(db){
 validateSimulations(db);
 cashValidate(db);
 if(!db||db.app!=='rutas-cuentas'||![1,2].includes(db.schema)||!Number.isInteger(db.revision)||db.revision<0||!Array.isArray(db.identities)||db.identities.length>100)throw Error('Respaldo de cuentas no válido.');
 const ids=new Set(),accountIds=new Set();let total=0;
 const safeId=v=>{text(v,'Identificador');if(!/^[A-Za-z0-9_.:-]+$/.test(v))throw Error('Identificador no válido.')};
 const checkMoney=v=>{if(!Number.isSafeInteger(v)||v<0||v>1e12)throw Error('Balance no válido.')};
 const checkDays=v=>{if(typeof v!=='number')throw Error('Días no válidos.');days(v)};
 const checkSigned=v=>{if(v!==null&&(!Number.isSafeInteger(v)||Math.abs(v)>1e12))throw Error('Importe de referencia no válido.')};
 for(const p of db.identities){
  safeId(p.id);text(p.name,'Nombre',80);if(ids.has(p.id)||!Array.isArray(p.accounts))throw Error('Identidad duplicada o no válida.');ids.add(p.id);const numbers=new Set();
  for(const a of p.accounts){
   if(++total>1000)throw Error('Demasiadas cuentas.');safeId(a.id);const num=companyForBook(a.book)+'::'+text(a.number,'Número',80).toLocaleLowerCase();if(ids.has(a.id)||!a.archivedAt&&numbers.has(num))throw Error('Cuenta duplicada.');ids.add(a.id);accountIds.add(a.id);if(!a.archivedAt)numbers.add(num);
   if(a.archivedAt!==undefined&&a.archivedAt!==null&&(typeof a.archivedAt!=='string'||!Number.isFinite(Date.parse(a.archivedAt))))throw Error('Fecha de papelera no válida.');
   checkMoney(a.balanceCents);checkDays(a.days);if(typeof a.firm!=='string'||a.firm.length>80||typeof a.isDemo!=='boolean'||!['eval','funded'].includes(a.phase)||!['activa','quemada'].includes(a.status)||!G.summary.base_books.some(b=>b.file===a.book))throw Error('Datos de cuenta no válidos.');
   if(a.riskContext!==undefined&&a.riskContext!==null)validateRisk(a.riskContext,a);
   if(a.nodeId!==null&&(typeof a.nodeId!=='string'||!N[a.nodeId]||N[a.nodeId].book!==a.book||context(N[a.nodeId]).phase!==a.phase))throw Error('Ruta de otra cuenta, libro o etapa.');
   if(typeof a.historyConfirmed!=='boolean'||typeof a.diverged!=='boolean'||![null,'BE','BURN'].includes(a.blockedOutcome)||(a.status==='quemada')!==(a.blockedOutcome==='BURN')||a.historyConfirmed!==!!a.nodeId)throw Error('Estado de ruta no válido.');
   if(!Array.isArray(a.events)||!a.events.length||a.events.length>10000||a.events[0].kind!=='created')throw Error('Historial no válido.');
   for(const ev of a.events){
    if(!['created','route','balance','result','phase','replica','details','archive','restore','selection'].includes(ev.kind)||typeof ev.at!=='string'||!Number.isFinite(Date.parse(ev.at))||!['eval','funded'].includes(ev.phase))throw Error('Evento no válido.');
    safeId(ev.id);checkMoney(ev.balanceCents);checkDays(ev.days);const eventBook=ev.book||a.book;if(!bookInfo(eventBook))throw Error('Libro histórico no válido.');
    if(ev.from&&(!N[ev.from]||N[ev.from].book!==eventBook))throw Error('Origen del evento no válido.');if(ev.to&&(!N[ev.to]||N[ev.to].book!==eventBook))throw Error('Destino del evento no válido.');
    if(['route','phase'].includes(ev.kind)&&!N[ev.to])throw Error('Falta destino del evento.');
    if(ev.kind==='route'&&(ev.reason==='resume_after_result'||ev.resultId!==undefined)){
     const index=a.events.indexOf(ev),prior=a.events.slice(0,index),last=prior.at(-1);
     const info=resumeInfo({...a,nodeId:ev.from,phase:ev.phase,status:'activa',blockedOutcome:null,historyConfirmed:true,archivedAt:null,events:prior});
     if(ev.reason!=='resume_after_result'||info.status!=='available'||ev.resultId!==info.resultId||ev.from!==info.from||ev.to!==info.to||!last||ev.balanceCents!==last.balanceCents||ev.days!==last.days)throw Error('La continuación confirmada no corresponde al resultado guardado.');
    }
    if(['balance','result'].includes(ev.kind)){checkMoney(ev.beforeBalance);checkDays(ev.beforeDays)}
    if(ev.kind==='balance'&&(typeof ev.note!=='string'||ev.note.length>400))throw Error('Nota no válida.');
    if(ev.kind==='result'){
     if(!['TP','SL','BURN','BE'].includes(ev.outcome)||ev.days<ev.beforeDays)throw Error('Resultado no válido.');checkSigned(ev.referenceFundCents);checkSigned(ev.referenceBrokerCents);
     if(ev.actualFundCents!==undefined){checkSigned(ev.actualFundCents);if(ev.actualFundCents!==ev.balanceCents-ev.beforeBalance)throw Error('El resultado real no coincide con el cambio de saldo.');}
     if(ev.projectedBalanceCents!==undefined){checkSigned(ev.projectedBalanceCents);if(ev.projectedBalanceCents!==(ev.to?ev.beforeBalance+ev.referenceFundCents:null))throw Error('La proyección guardada no coincide con la referencia.');}
     if(ev.historicalBalanceCents!==undefined){checkSigned(ev.historicalBalanceCents);if(ev.historicalBalanceCents!==(ev.to?expectedBalance(N[ev.to]):null))throw Error('El saldo histórico guardado no coincide con el Excel.');}
     if(ev.to){const ed=E[N[ev.from]?.outcomes?.[ev.outcome]];if(!ed||ed.to!==ev.to||Math.round(ed.fund_net*100)!==ev.referenceFundCents||Math.round(ed.broker_net*100)!==ev.referenceBrokerCents)throw Error('Transición o importes sin documentar en el historial.')}else if(ev.referenceFundCents!==null||ev.referenceBrokerCents!==null)throw Error('Referencia sin transición.');
    }
    if(ev.kind==='details'){text(ev.number,'Número',80);if(!ev.before||!bookInfo(ev.before.book)||!['eval','funded'].includes(ev.before.phase)||!['activa','quemada'].includes(ev.status)||typeof ev.note!=='string'||ev.note.length>400)throw Error('Corrección no válida.');checkMoney(ev.before.balanceCents);checkDays(ev.before.days)}
    if(ev.kind==='phase'&&!N[ev.from]?.transitions?.some(t=>t.to===ev.to))throw Error('Cambio de fase no documentado.');
    if(ev.kind==='replica'){
     checkMoney(ev.beforeBalance);checkDays(ev.beforeDays);text(ev.sourceNumber,'Número de madre',80);text(ev.groupId,'Grupo');
     const source=db.identities.flatMap(p=>p.accounts).find(x=>x.id===ev.sourceAccountId),sourceEvent=source?.events?.find(x=>x.id===ev.sourceEventId);
     if(!source||source.id===a.id||!sourceEvent||(sourceEvent.book||source.book)!==eventBook||!['initial','route','balance','correction','result','phase','sync'].includes(ev.reason)||!['eval','funded'].includes(ev.beforePhase)||!['activa','quemada'].includes(ev.beforeStatus))throw Error('Origen de réplica no válido.');
     if(ev.reason==='correction'&&(ev.from!==ev.to||ev.phase!==ev.beforePhase||!['balance','details'].includes(sourceEvent.kind)))throw Error('Corregir datos no permite cambiar el recorrido.');
     if(sourceEvent.balanceCents!==ev.balanceCents||sourceEvent.days!==ev.days||sourceEvent.phase!==ev.phase)throw Error('La réplica no coincide con el registro de la madre.');
     if(ev.reason==='result'&&(sourceEvent.kind!=='result'||ev.outcome!==sourceEvent.outcome))throw Error('Resultado replicado no válido.');
     if(ev.operationNodeId!==undefined&&(ev.reason!=='result'||ev.operationNodeId!==sourceEvent.from))throw Error('La operación replicada no coincide con la ruta de la madre.');
     if(ev.trackingNeedsReview!==undefined&&typeof ev.trackingNeedsReview!=='boolean')throw Error('Estado de seguimiento replicado no válido.');
     if(ev.actualFundCents!==undefined){checkSigned(ev.actualFundCents);if(ev.reason!=='result'||ev.actualFundCents!==(sourceEvent.actualFundCents??sourceEvent.balanceCents-sourceEvent.beforeBalance))throw Error('Resultado real replicado no válido.');}
    }
   }
   validatePendingHistory(a);
  }
  if(p.groups!==undefined&&!Array.isArray(p.groups))throw Error('Grupos no válidos.');const grouped=new Set();
  for(const g of p.groups||[]){safeId(g.id);if(ids.has(g.id)||!Array.isArray(g.followerIds)||!g.followerIds.length||g.followerIds.length>999)throw Error('Grupo duplicado o vacío.');ids.add(g.id);const members=[g.motherId,...g.followerIds];
   for(const aid of members){if(!p.accounts.some(a=>a.id===aid&&!a.archivedAt)||grouped.has(aid))throw Error('Las cuentas de un grupo deben ser distintas y de la misma identidad.');grouped.add(aid)}
   const mother=p.accounts.find(a=>a.id===g.motherId);if(members.some(aid=>p.accounts.find(a=>a.id===aid).book!==mother.book))throw Error('Grupo con distintos Excel.');
  }
 }
 if(db.company!==undefined&&!companies.some(c=>c.id===db.company))throw Error('Empresa no válida.');if(db.lastAccounts!==undefined){if(!db.lastAccounts||typeof db.lastAccounts!=='object'||Array.isArray(db.lastAccounts))throw Error('Selecciones no válidas.');for(const [co,aid] of Object.entries(db.lastAccounts)){if(!companies.some(c=>c.id===co)||(aid!==null&&(!accountIds.has(aid)||account(db,aid).archivedAt||companyForAccount(account(db,aid))!==co)))throw Error('Cuenta seleccionada de otra empresa.')}}
 if(db.selected!==null&&(!accountIds.has(db.selected)||account(db,db.selected).archivedAt))throw Error('Selección inválida.');const migrated=clone(db);migrated.schema=2;migrated.identities.forEach(p=>p.groups=p.groups||[]);return migrated
}
function merge(db,incoming){incoming=validate(incoming);const next=clone(db),idsMap=new Map(incoming.identities.flatMap(p=>[p,...p.accounts,...p.groups]).map(x=>[x.id,id()]));for(const p of incoming.identities){const name=next.identities.some(x=>x.name.toLocaleLowerCase()===p.name.toLocaleLowerCase())?p.name.slice(0,60)+' · respaldo '+new Date().toLocaleDateString('es-AR'):p.name;const added={...p,id:idsMap.get(p.id),name,accounts:p.accounts.map(a=>({...a,id:idsMap.get(a.id),...(a.pendingRoute?{pendingRoute:{...a.pendingRoute,accountId:idsMap.get(a.id)}}:{}),events:a.events.map(e=>e.kind==='selection'&&e.selection?{...e,selection:{...e.selection,accountId:idsMap.get(a.id)}}:e.kind==='replica'?{...e,sourceAccountId:idsMap.get(e.sourceAccountId),groupId:idsMap.get(e.groupId)||e.groupId}:e.kind==='details'?{...e,identityId:idsMap.get(e.identityId)||e.identityId,before:{...e.before,identityId:idsMap.get(e.before.identityId)||e.before.identityId}}:e)})),groups:p.groups.map(g=>({...g,id:idsMap.get(g.id),motherId:idsMap.get(g.motherId),followerIds:g.followerIds.map(aid=>idsMap.get(aid))}))};next.identities.push(added)}if(incoming.simulations?.length){const simIds=new Map(incoming.simulations.map(s=>[s.id,id()]));next.simulations=[...(next.simulations||[]),...incoming.simulations.map(s=>({...s,id:simIds.get(s.id),...(s.parentId?{parentId:simIds.get(s.parentId)||s.parentId}:{})}))]}const ledgerMap=new Map((incoming.ledger||[]).map(e=>[e.id,id()]));if(incoming.ledger?.length)next.ledger=[...(next.ledger||[]),...incoming.ledger.map(e=>({...e,id:ledgerMap.get(e.id),accountId:e.accountId?idsMap.get(e.accountId):null,...(e.reversalOf?{reversalOf:ledgerMap.get(e.reversalOf)}:{})}))];if(!next.selected)next.selected=next.identities.flatMap(p=>p.accounts).find(a=>!a.archivedAt)?.id||null;return validate(next)}
return {resumeInfo,resumeContinuation,trackingUnresolved,pendingOptions,pendingRoute,selectPending,cancelPending,operationConfiguration,newSimulation,simulationMoney,simulationState,stepSimulation,forkSimulation,cashKinds,cashAdd,cashVoid,cashSummary,G,N,E,companies,bookInfo,companyForBook,companyForAccount,context,op,history,expectedBalance,expectedDays,eligibility,assessment,branchAssessment,updateRisk,candidates,create,newIdentity,newAccount,account,bind,update,record,enterFunded,validate,merge,moneyInput,days,clone,groupFor,parseNumbers,newBatch,configureGroup,operate,detachGroup,renameIdentity,editAccountDetails,archiveAccount,restoreAccount};}
root.RutasModel={make,moneyInput};if(typeof module!=='undefined')module.exports=root.RutasModel;
})(globalThis);
