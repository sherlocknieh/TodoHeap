'use client'

import { Auth } from '@supabase/auth-ui-react'
import TodoList from '@/components/TodoList'
import { useSupabase } from './providers'

export default function HomePage() {
  const { session, supabase, loading } = useSupabase()

  return (
    <div className="w-full h-full bg-200">
      {!session ? (
        <div className="min-w-full min-h-screen flex items-center justify-center">
          <div className="w-full h-full flex justify-center items-center p-4">
            <div className="w-full h-full sm:h-auto sm:w-2/5 max-w-sm p-5 bg-white shadow flex flex-col text-base">
              <span className="font-sans text-4xl text-center pb-2 mb-1 border-b mx-4 align-center">Login</span>
              <Auth supabaseClient={supabase} theme="dark" />
            </div>
          </div>
        </div>
      ) : (
        <div
          className="w-full h-full flex flex-col justify-center items-center p-4"
          style={{ minWidth: 250, maxWidth: 600, margin: 'auto' }}
        >
          <TodoList session={session} supabase={supabase} />
          <button
            className="btn-black w-full mt-12"
            onClick={async () => {
              const { error } = await supabase.auth.signOut()
              if (error) console.log('Error logging out:', error.message)
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  )
}
