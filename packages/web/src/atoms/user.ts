import { atom } from 'jotai'
import { focusAtom } from 'jotai/optics'
import { atomWithStorage } from 'jotai/utils'

let userInfo = {
  email: undefined,
  emailState: '', // like confirmed, unverified, ... 
  code: '',
  oauthProvider: '',
  logged: false,
}

export const userInfoAtom = atomWithStorage('userInfo',userInfo);
