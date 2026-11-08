import type {DemoCase} from './fixtures'
const requested=typeof location==='undefined'?null:new URLSearchParams(location.search).get('demo')
export const demoCase:DemoCase|null=requested==='admin'||requested==='student'||requested==='empty'?requested:null
export const isDemo=demoCase!==null
export const demoActor=demoCase==='empty'?'demo-empty':demoCase==='admin'?'demo-admin':'demo-student'
export function demoUrl(scenario:DemoCase|null){const url=new URL(location.href);if(scenario)url.searchParams.set('demo',scenario);else url.searchParams.delete('demo');return url.href}
export function exitDemo(){location.assign(demoUrl(null))}
