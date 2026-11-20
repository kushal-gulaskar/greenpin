import { useContext,useEffect,useState,lazy,Suspense } from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter,Routes,Route,NavLink,Link,useLocation,useNavigate,useParams} from 'react-router-dom'
import {Trees,LayoutDashboard,MapPinned,UserRound,Plus,ArrowRight,Leaf,Sprout,HeartHandshake,Activity,MapPin,Menu,X,Search,ChevronRight,BookOpen,Compass} from 'lucide-react'
import {brand,date,demoTrees,healthOptions,repository,type Tree} from './data'
import {Register} from './Register'
import {FieldBook,Recent,JournalContext} from './FieldBook'
import {counts,journal,latestHealth,type Action,type Entry} from './journal'
import {cloud,loadCloud,writeEntry,register} from './cloud'
import {Account,AccountForm,AuthGate} from './Account'
import {ImportLocal} from './ImportLocal'
import './style.css'
const MapView=lazy(()=>import('./MapView'))
const nav=[{path:'/',label:'Overview',icon:LayoutDashboard},{path:'/trees',label:'My trees',icon:Trees},{path:'/explore',label:'Explore map',icon:MapPinned},{path:'/profile',label:'My profile',icon:UserRound}]
function Photo({tree}:{tree:Tree}){
 const [url,setUrl]=useState('')
 useEffect(()=>{if(typeof tree.photo==='string')return;const objectUrl=URL.createObjectURL(tree.photo);setUrl(objectUrl);return()=>URL.revokeObjectURL(objectUrl)},[tree.photo])
 return <img className="treephoto" src={typeof tree.photo==='string'?tree.photo:url||undefined} alt={tree.demo?'Sample forest photograph':tree.name}/>
}
function Badge({tree}:{tree:Tree}){return <span className={'badge '+(tree.health==='Healthy'?'':'amber')}><i/>{tree.health}</span>}
function Stats({trees,personal=false}:{trees:Tree[];personal?:boolean}){
 const {rows}=useContext(JournalContext)
 const {uid}=useContext(Account)
 const total=counts(trees,personal?rows.filter(r=>r.userId===uid):rows,uid)
 const items=[{label:'Registered trees',n:trees.length,icon:Trees},{label:'Trees planted',n:trees.filter(t=>t.kind==='New plantation').length,icon:Sprout},{label:'Trees under my care',n:total.care,icon:HeartHandshake},{label:'Maintenance activities',n:total.maintenance,icon:Activity},{label:'Need attention',n:total.attention,icon:Activity}]
 return <div className="stats">{items.map(({label,n,icon:Icon},i)=><div className={'stat s'+i} key={label}><span className="tile"><Icon size={21}/></span><strong>{n.toString().padStart(2,'0')}</strong><span>{label}</span></div>)}</div>
}
function Dashboard({trees}:{trees:Tree[]}){return <>
 <div className="hero"><span className="eyebrow"><i/> CONSERVATION DASHBOARD</span><h1>Your forest, at a glance.</h1><p>Register trees, follow their growth, and care for the green spaces around you.</p><Link className="heroBtn" to="/register"><Plus size={17}/>Register a tree</Link></div>
 <div className="sectionTitle"><h2>Conservation overview</h2><span className="muted">All records</span></div><Stats trees={trees}/>
 <Recent trees={trees}/><div className="lower"><section className="panel"><div className="panelHead"><h2>Recent activity</h2><Link to="/trees">My trees <ArrowRight size={15}/></Link></div>{trees.slice(0,4).map(t=><Link className="activity" to={'/trees/'+t.id} key={t.id}><Photo tree={t}/><div><b>{t.name}</b><small>{t.location}</small></div><ChevronRight size={16}/></Link>)}</section>
 <section className="panel exploreCard"><div className="park"><MapPin className="pin p1"/><MapPin className="pin p2"/><MapPin className="pin p3"/><span><Compass size={16}/> N</span></div><div className="exploreCopy"><h2>Explore the map</h2><p>Discover the trees in your local registry by location.</p><Link to="/explore">Open map <ArrowRight size={16}/></Link></div></section></div></>}
function Collection({trees}:{trees:Tree[]}){
 const {uid}=useContext(Account)
 const [query,setQuery]=useState(''),[health,setHealth]=useState(''),[source,setSource]=useState('')
 const list=trees.filter(t=>(!health||t.health===health)&&(!source||(cloud?t.owner===uid:(source==='sample')===t.demo))&&[t.name,t.species,t.location,t.id].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
 return <><h1>My trees</h1><p className="intro">{cloud?'Browse your accessible field records.':'Browse your field records and the sample collection.'}</p><div className="filters"><label><Search size={16}/><input aria-label="Search trees" placeholder="Search trees or locations" value={query} onChange={e=>setQuery(e.target.value)}/></label><select aria-label="Filter by health" value={health} onChange={e=>setHealth(e.target.value)}><option value="">All health statuses</option>{Array.from(new Set([...healthOptions,...trees.map(t=>t.health)])).map(x=><option key={x}>{x}</option>)}</select><select aria-label="Filter by source" value={source} onChange={e=>setSource(e.target.value)}><option value="">All records</option><option value="local">My registrations</option>{!cloud&&<option value="sample">Sample trees</option>}</select></div>
 <div className="cards">{list.map(t=><article className="panel card" key={t.id}><Photo tree={t}/><div><Badge tree={t}/><h2>{t.name}</h2><p>{t.location}</p><small>{cloud?'Cloud':t.demo?'Sample':'Local'} · {date(t.created)}</small><code>{t.id}</code><Link to={'/trees/'+t.id}>View details <ArrowRight size={15}/></Link></div></article>)}</div>{!list.length&&<p>No matching trees.</p>}</>
}
function Details({trees}:{trees:Tree[]}){
 const {id}=useParams(),t=trees.find(x=>x.id===id)
 if(!t)return <><h1>Tree record unavailable</h1><Link to="/trees">Back to my trees</Link></>
 return <><Link to="/trees">← My trees</Link><h1>{t.name}</h1><FieldBook key={t.id} tree={t}><section className="panel detail"><Photo tree={t}/><div><Badge tree={t}/><dl>{Object.entries({'Tree ID':t.id,Species:t.species,'Scientific name':t.scientific,Coordinates:t.lat+', '+t.lng,Location:t.location,'Estimated age':t.age?t.age+' years':'Unknown','Planting date':t.planted,Registration:t.kind+' · '+date(t.created),Source:cloud?'Cloud registry':t.demo?'Sample record':'Local demo user',Notes:t.notes}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'Unrecorded'}</dd></div>)}</dl></div></section></FieldBook></>
}
function AdoptionInbox(){
 const {rows,save}=useContext(JournalContext),{uid}=useContext(Account),[id,setId]=useState(''),[msg,setMsg]=useState('')
 async function submit(treeId:string,action:Action){try{await save(treeId,action);setMsg('Request updated.')}catch{setMsg('Request unavailable. Check the Tree ID and current request status.')}}
 return <section className="panel form"><h2>Request caretaking</h2><form onSubmit={e=>{e.preventDefault();void submit(id.trim(),{kind:'request'})}}><label>Shared Tree ID<input required value={id} onChange={e=>setId(e.target.value)}/></label><button className="outline">Request adoption</button></form><p role="status">{msg}</p>{rows.filter(r=>r.kind==='request'&&r.userId===uid).map(r=>r.kind==='request'&&<p key={r.id}>{r.treeId} · {r.status} {r.status==='pending'&&<button onClick={()=>submit(r.treeId,{kind:'decide',id:r.id,status:'withdrawn'})}>Withdraw request</button>}</p>)}</section>
}
function Profile({trees}:{trees:Tree[]}){const {uid}=useContext(Account);return <><h1>My profile</h1>{cloud?<><AccountForm/><AdoptionInbox/></>:<section className="panel pad"><span className="avatar">DC</span><h2>Demo caretaker</h2><p>Development-only demo user · India</p></section>}{cloud&&<p><Link to="/import">Import local records</Link></p>}<h2 className="sectionTitle">My contributions</h2><Stats personal trees={trees.filter(t=>cloud?t.owner===uid:!t.demo)}/><section className="panel pad"><h2>Environmental achievements</h2><p>Achievement tracking is planned for a future sprint.</p></section></>}
function App(){
 const [local,setLocal]=useState<Tree[]>([]),[ready,setReady]=useState(false),[failure,setFailure]=useState(false),[open,setOpen]=useState(false)
 const {uid,person}=useContext(Account)
 const [catalog,setCatalog]=useState<string[]>(),[sync,setSync]=useState('')
 async function refresh(){
  if(cloud){const data=await loadCloud(uid);setLocal(data.trees);setRows(data.rows);setCatalog(data.species)}
  else{const [trees,entries]=await Promise.all([repository.list(),journal.list()]);setLocal(trees);setRows(entries)}
  setFailure(false)
 }
 const [rows,setRows]=useState<Entry[]>([])
 async function save(id:string,action:Action,eventId?:string){
  if(cloud){setSync('Synchronizing…');try{await writeEntry(uid,id,action,eventId);await refresh()}finally{setSync('')}return}
  await journal.save(id,action)
  setRows(await journal.list())
 }
 const location=useLocation(),navigate=useNavigate()
 useEffect(()=>{refresh().catch(()=>setFailure(true)).finally(()=>setReady(true));document.title=brand+' | Conservation workspace'},[])
 useEffect(()=>{setOpen(false);window.scrollTo(0,0)},[location.pathname])
 const trees=[...local,...(cloud?[]:demoTrees)].map(t=>({...t,health:latestHealth(t,rows)})).sort((a,b)=>b.created.localeCompare(a.created))
 const active=nav.find(n=>n.path==='/'?location.pathname==='/':location.pathname.startsWith(n.path))?.label||'Register a tree'
 return <JournalContext.Provider value={{rows,save}}><div className="shell">{open&&<button aria-label="Close navigation" className="scrim" onClick={()=>setOpen(false)}/>}<aside className={open?'open':''}><Link className="brand" to="/"><span><Trees/></span>{brand}</Link><div className="navLabel">WORKSPACE</div><nav>{nav.map(({path,label,icon:Icon})=><NavLink end={path==='/'} key={path} to={path}><Icon size={19}/>{label}</NavLink>)}</nav><div className="sideBottom"><div className="local"><i/> {cloud?(sync||'Cloud workspace'):'Local workspace'}</div><Link className="identity" to="/profile"><span className="avatar">{person?.display_name.slice(0,2)||"DC"}</span><div><b>{person?.display_name||'Demo caretaker'}</b><small>{cloud?'Signed in':'Development profile'}</small></div></Link></div></aside>
 <main><header><button className="menu" aria-label="Toggle navigation" onClick={()=>setOpen(!open)}>{open?<X/>:<Menu/>}</button><span><BookOpen size={16}/> Workspace <ChevronRight size={13}/> <b>{active}</b></span><Link to="/register" className="primary"><Plus size={16}/> Register tree</Link></header>
 <div className="content">{sync&&<p role="status">{sync}</p>}{failure&&<p role="alert">Records could not be loaded. Check your connection and <button onClick={()=>refresh().catch(()=>setFailure(true))}>retry</button>.</p>}{ready&&!failure?<Routes><Route path="/" element={<Dashboard trees={trees}/>}/><Route path="/trees" element={<Collection trees={trees}/>}/><Route path="/trees/:id" element={<Details trees={trees}/>}/><Route path="/profile" element={<Profile trees={trees}/>}/><Route path="/explore" element={<Suspense fallback={<p>Loading map…</p>}><MapView trees={trees}/></Suspense>}/><Route path="/import" element={cloud?<ImportLocal refresh={refresh}/>:<p>Switch to cloud mode to import records.</p>}/><Route path="/register" element={<Register species={catalog} save={async t=>{if(cloud){try{await register(uid,t,setSync);setSync('Verifying saved tree…');await refresh()}finally{setSync('')}}else{await repository.add(t);setLocal(prev=>[t,...prev])}navigate('/trees/'+t.id)}}/>}/><Route path="*" element={<h1>Page unavailable</h1>}/></Routes>:!failure&&<p>Loading records…</p>}<footer><Leaf size={14}/> {brand} <span>Conservation workspace · India</span></footer></div></main></div></JournalContext.Provider>
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthGate><App/></AuthGate></BrowserRouter>)