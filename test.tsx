import {
  render,
  signal,
  useComputed,
  useSignal,
} from "./index.ts"
import {
  useEffect,
  useState,
} from "./packages/preact/hooks/src/index.js"

const State = signal({
  count: 0,
})
function Counter() {
  const count = useSignal(0)
  const double = useComputed(() => count.value * 2)

  return (
    <div>
      <p>
        {count} x 2 = {double}
      </p>
      <button onClick={() => count.value++}>
        click me
      </button>
    </div>
  )
}

function App() {
  useEffect(() => {
    setInterval(() => {
      console.log("count", State.value.count)
      State.value.count++
    }, 100)
  }, [])

  return (
    <div>
      Hello, world! {State.value.count}
      <Counter />
      Counter above
    </div>
  )
}

render(<App />, document.body)
