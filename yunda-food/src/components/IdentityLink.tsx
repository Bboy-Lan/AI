import {repository} from '../services/repository'
export function IdentityLink(){return !repository.context.uid||!repository.context.profile?<button type="button" className="button secondary" onClick={()=>{sessionStorage.setItem('xsyj-return',location.hash);location.hash=repository.context.uid?'/onboarding':'/login'}}>{repository.context.uid?'完善头像、昵称和家乡':'登录 / 注册后继续'}</button>:null}
