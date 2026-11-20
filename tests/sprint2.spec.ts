import {test,expect} from '@playwright/test'
import type * as Journal from '../src/journal'
const sample='44e0bbef-0cc9-4523-84be-b88400000000'
test('upgrading a Sprint 1 database preserves its registration and photograph',async({page})=>{
 await page.route('**/seed-v1',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}))
 await page.goto('/seed-v1')
 await page.evaluate(async()=>{
  const photo=await (await fetch('/images/canopy.jpg')).blob()
  await new Promise<void>((resolve,reject)=>{
   const req=indexedDB.open('nature-ecosystem',1)
   req.onupgradeneeded=()=>req.result.createObjectStore('trees',{keyPath:'id'})
   req.onsuccess=()=>{const db=req.result,tx=db.transaction('trees','readwrite')
    tx.objectStore('trees').add({id:'existing-id',name:'Legacy neem',photo,created:'2025-01-01T00:00:00Z',health:'Recovering',location:'Garden',lat:10,lng:75,kind:'Existing tree',demo:false,species:'Neem'})
    tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)
   }
  })
 })
 await page.goto('/trees/existing-id')
 await expect(page.getByRole('heading',{name:'Legacy neem'})).toBeVisible()
 await expect(page.getByText('Recovering')).toBeVisible()
 await expect.poll(()=>page.getByAltText('Legacy neem').evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
})
test('domain validation and concurrent repository writes',async({page})=>{
 await page.goto('/')
 const results=await page.evaluate(async(id)=>{
  const path='/src/journal.ts', {changes,journal,counts}:typeof Journal=await import(path)
  const valid={kind:'growth' as const,day:'2025-01-10',height:150,circumference:20,leaves:'Green',health:'Healthy',notes:''}
  const invalid=[{height:-1},{height:18000},{circumference:7000},{day:'2025-02-30'},{day:'2999-01-01'}].every(change=>{try{changes(id,[],{...valid,...change});return false}catch{return true}})
  let orphan=false
  try{await journal.save('absent',{kind:'maintenance',activity:'Watering',when:new Date().toISOString(),notes:''})}catch{orphan=true}
  for(const status of ['withdrawn','rejected'] as const){
   await journal.save(id,{kind:'request'})
   const pending=(await journal.list()).find(r=>r.kind==='request'&&r.status==='pending')!
   await journal.save(id,{kind:'decide',id:pending.id,status})
  }
  await journal.save(id,{kind:'request'})
  const pending=(await journal.list()).find(r=>r.kind==='request'&&r.status==='pending')!
  const outcomes=await Promise.allSettled([1,2].map(()=>journal.save(id,{kind:'decide',id:pending.id,status:'approved'})))
  const before=await journal.list(),active=before.find(r=>r.kind==='assignment')!
  await journal.save(id,{kind:'release',id:active.id})
  return {invalid,orphan,approved:outcomes.filter(r=>r.status==='fulfilled').length,care:counts([],before).care,after:counts([],await journal.list()).care}
 },sample)
 expect(results).toEqual({invalid:true,orphan:true,approved:1,care:1,after:0})
})
test('caretaker, growth, maintenance, health and dashboard survive reload',async({page})=>{
 await page.goto('/trees/'+sample)
 const button=(name:string)=>page.getByRole('button',{name,exact:true})
 await button('Caretaker').click();await button('Request adoption').click();await button('Approve request').click()
 await expect(button('Release responsibility')).toBeVisible()
 await button('Growth').click()
 for(const [day,height] of [['2026-06-10','150'],['2026-06-09','140']]){
  await page.getByLabel('Height (cm)',{exact:true}).fill(height)
  await page.getByLabel('Trunk circumference').fill('20');await page.getByLabel('Leaf condition').fill('Yellow edges')
  await page.getByLabel('Observation date').fill(day);await page.getByLabel('Health status').selectOption('Needs attention')
  await page.getByLabel('Observation photograph').setInputFiles('public/images/light.jpg')
  await button('Save measurement').click()
  await expect(page.getByText('Height '+height+' cm · Trunk 20 cm',{exact:true})).toBeVisible()
 }
 await expect(page.locator('.timeline li').first()).toContainText('140 cm')
 await page.reload();await expect(page.locator('canvas')).toBeVisible()
 await expect.poll(()=>page.getByAltText('Observation photograph',{exact:true}).first().evaluate(el=>(el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
 await button('Maintenance').click();await button('Save maintenance').click();await expect(page.locator('.timeline')).toContainText('Watering')
 await button('Overview').click();await expect(page.locator('.badge')).toHaveText('Needs attention')
 await page.getByLabel('Health status').selectOption('Under treatment');await page.getByLabel('Concern or notes').fill('Caretaker monitoring canopy');await button('Save health observation').click()
 await expect(page.locator('.badge')).toHaveText('Under treatment')
 await page.reload();await expect(page.locator('.badge')).toHaveText('Under treatment');await button('History').click()
 await expect(page.locator('.timeline')).toContainText('Caretaker monitoring canopy')
 await expect(page.locator('.timeline')).toContainText('Watering')
 await page.goto('/')
 await expect(page.locator('.stat').filter({hasText:'Trees under my care'})).toContainText('01')
 await expect(page.locator('.stat').filter({hasText:'Maintenance activities'})).toContainText('01')
 await expect(page.locator('.stat').filter({hasText:'Need attention'})).toContainText('01')
 await expect(page.getByRole('heading',{name:'Recent growth updates'}).locator('..')).toContainText('150 cm')
})
