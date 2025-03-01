import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import DashboardLayoutSlots from "./components/dashboard.jsx";


function App() {
  const [count, setCount] = useState(0)

  return (
      <DashboardLayoutSlots/>
  )
}

export default App
