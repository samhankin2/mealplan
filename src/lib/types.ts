/** YYYY-MM-DD, local calendar. */
export type Day = string

export interface User {
  id: string
  email: string
  displayName: string | null
}

export interface Member {
  id: string
  name: string
  me: boolean
}

export interface Partner {
  status: 'linked' | 'pending'
  email: string
  name?: string | null
}

export interface Household {
  id: string
  members: Member[]
  partner: Partner | null
}
