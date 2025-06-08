import {
  signal,
  useComputed,
  useSignal,
} from "@preact/signals"
import { render } from "preact"
import {
  useEffect,
  useState,
} from "preact/hooks"

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
