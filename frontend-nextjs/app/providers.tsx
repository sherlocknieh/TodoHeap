'use client'

import { createBrowserClient } from '@supabase/auth-helpers-react'
import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/schema'

type SupabaseContextValue = {
  supabase: SupabaseClient<Database>
  session: Session | null
  loading: boolean
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null)

function SupabaseProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(
    () =>
      createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
      ),
    []
  )

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getInitialSession = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (!error) setSession(data.session)
      setLoading(false)
    }

    getInitialSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [supabase])

  const value = useMemo(() => ({ supabase, session, loading }), [supabase, session, loading])

  return <SupabaseContext.Provider value={value}>{children}</SupabaseContext.Provider>
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext)
  if (!ctx) throw new Error('useSupabase must be used inside SupabaseProvider')
  return ctx
}

export default function Providers({ children }: { children: ReactNode }) {
  return <SupabaseProvider>{children}</SupabaseProvider>
}
