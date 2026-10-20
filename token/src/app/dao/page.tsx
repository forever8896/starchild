import { redirect } from 'next/navigation'

// The DAO was retired in favour of a forum (too early for governance). Anyone
// landing on /dao is sent to the discussion.
export default function DaoRedirect() {
  redirect('/forum')
}
