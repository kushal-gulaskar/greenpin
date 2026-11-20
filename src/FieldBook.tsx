import {createContext,useContext,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react'
import {Link,useSearchParams} from 'react-router-dom'
import {Chart,LineController,LineElement,PointElement,LinearScale,Tooltip} from 'chart.js'
import {BookOpen,Sprout,Droplets,HeartHandshake,Clock} from 'lucide-react'
import {date,healthOptions,type Tree} from './data'
import {Account} from './Account'
import {cloud} from './cloud'
import {activities,localDay,type Action,type Entry,type TreeGrowthRecord} from './journal'
Chart.register(LineController,LineElement,PointElement,LinearScale,Tooltip)
export const JournalContext=createContext<{rows:Entry[];save:(id:string,action:Action,eventId?:string)=>Promise<void>}>({rows:[],save:async()=>{throw Error('Storage unavailable')}})
function Snapshot({photo}:{photo:Blob}){
 const [url,setUrl]=useState('')
 useEffect(()=>{const next=URL.createObjectURL(photo);setUrl(next);return()=>URL.revokeObjectURL(next)},[photo])
 return <img className="observationPhoto" alt="Observation photograph" src={url||undefined}/>
}
function Heights({records}:{records:TreeGrowthRecord[]}){
 const ref=useRef<HTMLCanvasElement>(null)
 useEffect(()=>{
  if(records.length<2||!ref.current)return
  const chart=new Chart(ref.current,{type:'line',data:{datasets:[{label:'Height (cm)',data:records.map(r=>({x:Date.parse(r.day),y:r.height})),borderColor:'#34704c',backgroundColor:'#34704c',pointRadius:4}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{type:'linear',ticks:{maxTicksLimit:5,callback:v=>new Date(Number(v)).toISOString().slice(0,10)}},y:{title:{display:true,text:'Height (cm)'}}},plugins:{tooltip:{callbacks:{title:items=>records[items[0].dataIndex].day}}}}})
  return()=>chart.destroy()
 },[records])
 return <section className="panel pad"><h2>Height over time</h2>{records.length<2?<p>Record two measurements to see height over time.</p>:<div className="chart"><canvas ref={ref} role="img" aria-label="Height measurements over time. Values are listed in measurement history."/></div>}</section>
}
function events(rows:Entry[]){
 return rows.flatMap(r=>{
  const item=(at:string,title:string,notes='',photo?:Blob)=>({id:r.id+title,treeId:r.treeId,at,title,notes,photo})
  switch(r.kind){
   case 'request':return [item(r.created,'Adoption requested'),...(r.decided?[item(r.decided,'Request '+r.status)]:[])]
   case 'assignment':return [item(r.created,'Caretaker assigned'),...(r.released?[item(r.released,'Caretaker released')]:[])]
   case 'growth':return [item(r.day,'Height '+r.height+' cm · Trunk '+r.circumference+' cm', [r.health,'Leaves: '+r.leaves,r.notes].filter(Boolean).join(' · '),r.photo)]
   case 'health':return r.growthId?[]:[item(r.day,'Health observation · '+r.health,r.notes)]
   case 'maintenance':return [item(r.when,r.activity,r.notes,r.photo)]
  }
 })
}
function Timeline({rows,ascending=false,trees}:{rows:Entry[];ascending?:boolean;trees?:Tree[]}){
 const items=events(rows).sort((a,b)=>(ascending?1:-1)*a.at.localeCompare(b.at))
 return items.length?<ol className="timeline">{(trees?items.slice(0,4):items).map(e=><li key={e.id}><small>{e.at.length===10?e.at:new Date(e.at).toLocaleString('en-IN')}</small><b>{e.title}</b>{trees&&<Link to={'/trees/'+e.treeId}>{trees.find(t=>t.id===e.treeId)?.name}</Link>}{e.notes&&<p>{e.notes}</p>}{e.photo&&!trees&&<Snapshot photo={e.photo}/>}</li>)}</ol>:<p>No entries yet.</p>
}
export function Recent({trees}:{trees:Tree[]}){
 const {rows}=useContext(JournalContext)
 return <div className="lower"><section className="panel pad"><h2>Recent growth updates</h2><Timeline rows={rows.filter(r=>r.kind==='growth')} trees={trees}/></section><section className="panel pad"><h2>Recent caretaker activities</h2><Timeline rows={rows.filter(r=>['request','assignment','maintenance'].includes(r.kind))} trees={trees}/></section></div>
}
function EntryForm({kind,tree}:{kind:'growth'|'maintenance'|'health';tree:Tree}){
 const {save}=useContext(JournalContext),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
 const entryId=useRef(crypto.randomUUID())
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=event.currentTarget,f=new FormData(form),get=(key:string)=>String(f.get(key)??'').trim()
  const file=f.get('photo'),photo=file instanceof File&&file.size?file:undefined
  const obs={day:get('day'),health:get('health'),notes:get('notes')}
  setBusy(true);setMessage('')
  try{
   let action:Action
   if(kind==='maintenance')action={kind,activity:get('activity'),when:new Date(get('when')).toISOString(),notes:obs.notes,photo}
   else if(kind==='health')action={kind,...obs}
   else action={kind,...obs,height:Number(get('height')),circumference:Number(get('circumference')),leaves:get('leaves'),photo}
   await save(tree.id,action,entryId.current);entryId.current=crypto.randomUUID();form.reset();setMessage('Record saved.')
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to save record.')}
  finally{setBusy(false)}
 }
 return <form className="panel form journalForm" onSubmit={submit}><h2>{kind==='growth'?'Add a measurement':kind==='maintenance'?'Log maintenance':'Record health or report a concern'}</h2>
 {kind==='growth'&&<><div className="fields"><label>Height (cm)<input required name="height" type="number" min=".01" max="15000" step=".01"/></label><label>Trunk circumference (cm)<input required name="circumference" type="number" min=".01" max="6000" step=".01"/></label></div><label>Leaf condition<input required name="leaves"/></label></>}
 {kind==='maintenance'?<div className="fields"><label>Activity<select name="activity">{activities.map(a=><option key={a}>{a}</option>)}</select></label><label>Activity date and time<input required type="datetime-local" name="when" defaultValue={localDay()+'T'+new Date().toTimeString().slice(0,5)}/></label></div>:<div className="fields"><label>Observation date<input required type="date" name="day" max={localDay()} defaultValue={localDay()}/></label><label>Health status<select required name="health" defaultValue=""><option value="" disabled>Select status</option>{healthOptions.map(h=><option key={h}>{h}</option>)}</select></label></div>}
 {kind!=='health'&&<label>Observation photograph (optional)<input type="file" name="photo" accept="image/png,image/webp,image/jpeg"/></label>}
 <label>{kind==='health'?'Concern or notes':'Additional observations'}<textarea name="notes" rows={2}/></label>
 <button className="primary" disabled={busy}>{busy?'Saving…':'Save '+(kind==='growth'?'measurement':kind==='health'?'health observation':'maintenance')}</button><p role="status">{message}</p></form>
}
function Caretaker({tree,rows}:{tree:Tree;rows:Entry[]}){
 const {save}=useContext(JournalContext),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const {uid}=useContext(Account)
 const active=rows.find(r=>r.kind==='assignment'&&!r.released),pending=rows.find(r=>r.kind==='request'&&r.status==='pending')
 async function run(action:Action){setBusy(true);setError('');try{await save(tree.id,action)}catch(e){setError(String(e))}finally{setBusy(false)}}
 return <><section className="panel pad"><h2>Primary caretaker</h2><p>{active?(cloud?(active.userId===uid?'You':active.userId):'Demo caretaker'):'No caretaker assigned.'}</p><p>Caretaking records responsibility for tree care. Legal ownership is separate.</p>
 {active?<button disabled={busy} className="outline" onClick={()=>run({kind:'release',id:active.id})}>Release responsibility</button>:pending?<><p>Pending adoption request · {cloud?pending.userId:'Local demo review'}</p><div className="choices">{(['approved','rejected','withdrawn'] as const).map((s,i)=>(!cloud||(s==='withdrawn'?pending.userId===uid:tree.owner===uid&&pending.userId!==uid))&&<button disabled={busy} className="outline" key={s} onClick={()=>run({kind:'decide',id:pending.id,status:s})}>{['Approve request','Reject request','Withdraw request'][i]}</button>)}</div></>:cloud&&tree.owner===uid?<p>Share the Tree ID privately with a prospective caretaker. They can request adoption from their profile.</p>:<button disabled={busy} className="primary" onClick={()=>run({kind:'request'})}>Request adoption</button>}
 {error&&<p role="alert">{error}</p>}</section><section className="panel pad"><h2>Caretaker history</h2><Timeline rows={rows.filter(r=>r.kind==='request'||r.kind==='assignment')}/></section></>
}
const sections=[['Overview',BookOpen],['Growth',Sprout],['Maintenance',Droplets],['Caretaker',HeartHandshake],['History',Clock]] as const
export function FieldBook({tree,children}:{tree:Tree;children:ReactNode}){
 const [params,setParams]=useSearchParams(),tab=params.get('tab')||'Overview'
 const rows=useContext(JournalContext).rows.filter(r=>r.treeId===tree.id)
 const growth=rows.filter((r):r is TreeGrowthRecord=>r.kind==='growth').sort((a,b)=>a.day.localeCompare(b.day)||a.created.localeCompare(b.created))
 return <><div className="bookTabs" aria-label="Tree profile sections">{sections.map(([name,Icon])=><button key={name} aria-current={tab===name?'page':undefined} onClick={()=>setParams({tab:name})}><Icon size={16}/>{name}</button>)}</div><div className="bookBody">
 {tab==='Growth'?<><Heights records={growth}/><EntryForm tree={tree} kind="growth"/><section className="panel pad"><h2>Measurement history</h2><Timeline rows={growth} ascending/></section></>:tab==='Maintenance'?<><EntryForm tree={tree} kind="maintenance"/><section className="panel pad"><h2>Maintenance timeline</h2><Timeline rows={rows.filter(r=>r.kind==='maintenance')}/></section></>:tab==='Caretaker'?<Caretaker tree={tree} rows={rows}/>:tab==='History'?<section className="panel pad"><h2>Tree history</h2><Timeline rows={rows}/><small>Registered {date(tree.created)}</small></section>:<>{children}<EntryForm tree={tree} kind="health"/></>}
 </div></>
}