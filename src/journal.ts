import {demoTrees,healthOptions,openDatabase,type Tree} from './data'

export const userId='local-demo-caretaker'
export const activities=['Watering','Mulching','Compost application','Health inspection','Protection inspection','Soil inspection','Other maintenance']
export type Decision='approved'|'rejected'|'withdrawn'
interface Base {id:string;treeId:string;userId:string;created:string}
export interface AdoptionRequest extends Base {kind:'request';status:'pending'|Decision;decided?:string}
export interface CaretakerAssignment extends Base {kind:'assignment';requestId:string;released?:string}
interface Observation {day:string;health:string;notes:string}
export interface TreeGrowthRecord extends Base,Observation {kind:'growth';height:number;circumference:number;leaves:string;photo?:Blob}
export interface TreeMaintenanceRecord extends Base {kind:'maintenance';activity:string;when:string;photo?:Blob;notes:string}
export interface TreeHealthObservation extends Base,Observation {kind:'health';growthId?:string}
export type Entry=AdoptionRequest|CaretakerAssignment|TreeGrowthRecord|TreeMaintenanceRecord|TreeHealthObservation
type Fields<T>=Omit<T,keyof Base>
export type Action=Fields<TreeGrowthRecord>|Fields<TreeMaintenanceRecord>|Fields<TreeHealthObservation>|{kind:'request'}|{kind:'decide';id:string;status:Decision}|{kind:'release';id:string}
export function localDay(d=new Date()){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function check(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message)}
export function changes(treeId:string,rows:Entry[],action:Action):Entry[]{
 const created=new Date().toISOString()
 const base=()=>({id:crypto.randomUUID(),treeId,userId,created})
 const active=rows.find(r=>r.kind==='assignment'&&!r.released)
 if(action.kind==='request'){
  check(!active,'A primary caretaker is already assigned.')
  check(!rows.some(r=>r.kind==='request'&&r.status==='pending'),'A request is already pending.')
  return [{...base(),kind:'request',status:'pending'}]
 }
 if(action.kind==='decide'){
  const request=rows.find(r=>r.id===action.id)
  check(request?.kind==='request'&&request.status==='pending','This request is no longer pending.')
  check(['approved','rejected','withdrawn'].includes(action.status),'Invalid request decision.')
  const result:Entry[]=[{...request,status:action.status,decided:created}]
  if(action.status==='approved'){
   check(!active,'A primary caretaker is already assigned.')
   result.push({...base(),kind:'assignment',requestId:request.id,userId:request.userId})
  }
  return result
 }
 if(action.kind==='release'){
  check(active?.kind==='assignment'&&active.id===action.id,'This assignment is no longer active.')
  return [{...active,released:created}]
 }
 if('photo' in action&&action.photo)check(action.photo.size>0&&action.photo.size<=10485760&&['image/png','image/webp','image/jpeg'].includes(action.photo.type),'Choose a JPG, PNG or WebP photo up to 10 MB.')
 if(action.kind==='maintenance'){
  check(activities.includes(action.activity),'Choose a maintenance activity.')
  const stamp=new Date(action.when)
  check(Number.isFinite(+stamp)&&stamp.toISOString()===action.when&&+stamp<=Date.now(),'Enter a valid activity time in the past or present.')
  return [{...action,...base()}]
 }
 const day=new Date(action.day+'T12:00:00')
 check(/^\d{4}-\d{2}-\d{2}$/.test(action.day)&&localDay(day)===action.day&&action.day<=localDay(),'Enter a valid observation date through today.')
 check(healthOptions.includes(action.health),'Choose a health status.')
 const health:TreeHealthObservation={...base(),kind:'health',day:action.day,health:action.health,notes:action.notes}
 if(action.kind==='health')return [health]
 check(action.height>0&&action.height<=15000,'Height must be above zero and at most 15,000 cm.')
 check(action.circumference>0&&action.circumference<=6000,'Circumference must be above zero and at most 6,000 cm.')
 check(action.leaves.trim(),'Describe the leaf condition.')
 const growth={...action,...base()}
 return [growth,{...health,growthId:growth.id}]
}
function result<T>(req:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
export const journal={
 async list():Promise<Entry[]>{
  const db=await openDatabase()
  try{return await result(db.transaction('journal').objectStore('journal').getAll())}finally{db.close()}
 },
 async save(treeId:string,action:Action){
  const db=await openDatabase()
  try{
   const tx=db.transaction(['trees','journal'],'readwrite')
   const completed=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('Save cancelled.'))})
   try{
    const store=tx.objectStore('journal')
    const [local,rows]=await Promise.all([result(tx.objectStore('trees').getKey(treeId)),result<Entry[]>(store.index('treeId').getAll(treeId))])
    check(local||demoTrees.some(t=>t.id===treeId),'The referenced tree does not exist.')
    for(const row of changes(treeId,rows,action))store.put(row)
   }catch(error){try{tx.abort()}catch{} await completed.catch(()=>{});throw error}
   await completed
  }finally{db.close()}
 }
}
export function latestHealth(tree:Tree,rows:Entry[]){
 const observations=rows.filter((r):r is TreeHealthObservation=>r.treeId===tree.id&&r.kind==='health').sort((a,b)=>b.day.localeCompare(a.day)||b.created.localeCompare(a.created))
 return observations[0]&&observations[0].day>=localDay(new Date(tree.created))?observations[0].health:tree.health
}
export function counts(trees:Tree[],rows:Entry[],actor=userId){
 return {care:rows.filter(r=>r.kind==='assignment'&&!r.released&&r.userId===actor).length,maintenance:rows.filter(r=>r.kind==='maintenance').length,attention:trees.filter(t=>latestHealth(t,rows)==='Needs attention').length}
}
