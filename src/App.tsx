import { show } from './data'
import { Wrapped } from './components/Wrapped'

export default function App() {
  if (show.categories.length === 0) {
    return (
      <div className="stage-bg flex min-h-dvh items-center justify-center">
        <div className="mx-auto max-w-xl px-6 py-20 text-center text-stone-400">
          <p className="font-display text-2xl text-amber-200">The stage is set…</p>
          <p className="mt-4">
            No ceremony data yet. Run{' '}
            <code className="rounded bg-white/10 px-2 py-0.5 text-amber-300">npm run harvest</code>{' '}
            then{' '}
            <code className="rounded bg-white/10 px-2 py-0.5 text-amber-300">npm run judge</code> to
            bake <code className="text-amber-300">data/awards-{show.season}.json</code>.
          </p>
        </div>
      </div>
    )
  }

  return <Wrapped show={show} />
}
