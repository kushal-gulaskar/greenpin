import { useContext,useState, type FormEvent } from 'react'
import {Account} from './Account'
import {cloud} from './cloud'
import { LocateFixed, Camera, Plus } from 'lucide-react'
import { species as defaultSpecies,healthOptions,type Tree } from './data'
export function Register({save,species=defaultSpecies}:{species?:string[];save:(tree:Tree)=>Promise<void>}){
 const {uid}=useContext(Account),draftKey='greenpin-registration:'+uid
 const [permanentId]=useState(()=>cloud?(sessionStorage.getItem(draftKey)||crypto.randomUUID()):crypto.randomUUID())
 const [coords,setCoords]=useState({lat:'',lng:''}),[gps,setGps]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 function locate(){
  if(!navigator.geolocation){setGps('GPS is unavailable. Enter coordinates manually.');return}
  setGps('Locating…')
  navigator.geolocation.getCurrentPosition(p=>{setCoords({lat:String(p.coords.latitude),lng:String(p.coords.longitude)});setGps('Location captured.')},()=>setGps('Location unavailable. Enter coordinates manually.'),{timeout:12000})
 }
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault()
  const f=new FormData(event.currentTarget),get=(k:string)=>String(f.get(k)??'').trim(),photo=f.get('photo') as File
  if(!get('name')||!get('location')){setError('Enter a tree name and location description.');return}
  if(!['image/jpeg','image/png','image/webp'].includes(photo.type)||photo.size>10*1024*1024||!photo.size){setError('Choose a JPG, PNG or WebP photograph up to 10 MB.');return}
  setBusy(true);setError('')
  try{if(cloud)sessionStorage.setItem(draftKey,permanentId);await save({id:permanentId,name:get('name'),scientific:get('scientific'),species:get('species'),kind:get('kind'),planted:get('planted'),age:get('age'),photo,lat:+coords.lat,lng:+coords.lng,location:get('location'),health:get('health'),notes:get('notes'),created:new Date().toISOString(),demo:false,adopted:false});if(cloud)sessionStorage.removeItem(draftKey)}
  catch{setError('Save failed. Check your connection or storage and retry here with the same tree ID.');setBusy(false)}
 }
 return <><h1>Register a tree</h1><p className="intro">Add a photograph and location to start your tree’s field record.</p><form onSubmit={submit} className="panel form">
 <h2>Tree information</h2><div className="fields"><label>Common name<input name="name" required maxLength={120}/></label><label>Scientific name (optional)<input name="scientific"/></label>
 <label>Species<select aria-label="Species" name="species" required defaultValue=""><option value="" disabled>Select species</option>{species.map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Registration type<select name="kind"><option>New plantation</option><option>Existing tree</option></select></label>
 <label>Planting date (if known)<input type="date" name="planted" max={new Date().toLocaleDateString('en-CA')}/></label><label>Estimated age in years (optional)<input type="number" min="0" step="any" name="age"/></label></div>
 <label><span><Camera size={16}/> Tree photograph</span><input type="file" accept="image/jpeg,image/png,image/webp" name="photo" required/><small>JPG, PNG or WebP · Up to 10 MB</small></label>
 <h2>Location</h2><button className="outline" type="button" onClick={locate}><LocateFixed size={16}/> Capture GPS location</button><p role="status">{gps}</p>
 <div className="fields">{(['lat','lng'] as const).map((key,i)=><label key={key}>{i?'Longitude':'Latitude'}<input type="number" required step="any" min={i?-180:-90} max={i?180:90} value={coords[key]} onChange={e=>setCoords({...coords,[key]:e.target.value})}/></label>)}</div>
 <label>Location description<input name="location" required/></label><label>Current health status<select name="health">{healthOptions.map(x=><option key={x}>{x}</option>)}</select></label><label>Additional notes (optional)<textarea name="notes" rows={3}/></label>
 {error&&<p role="alert">{error}</p>}<button className="primary" disabled={busy}><Plus size={16}/>{busy?'Saving tree and photograph…':'Save tree'}</button></form></>
}