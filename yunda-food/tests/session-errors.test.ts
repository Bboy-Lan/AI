import test from 'node:test'
import assert from 'node:assert/strict'
import {checkSessionError} from '../src/platform/session-errors'
test('恢复登录失败必须区分断网与失效，不能悄悄覆盖为匿名会话',()=>{assert.doesNotThrow(()=>checkSessionError(null));assert.throws(()=>checkSessionError({code:'unreachable',message:'网络暂时不可用'}),/网络暂时不可用/);assert.throws(()=>checkSessionError({code:'invalid_refresh_token',message:'invalid token'}),/重新登录/);assert.throws(()=>checkSessionError({code:'refresh_token_expired'}),/重新登录/);assert.throws(()=>checkSessionError({message:'刷新凭证已过期'}),/重新登录/)})
