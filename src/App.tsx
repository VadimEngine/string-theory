import { useState } from 'react'
import './App.css'
import Tuner from './components/Tuner'
import Scales from './components/Scales'
import Theory from './components/Theory'

type Tab = 'tuner' | 'scales' | 'theory'

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('tuner')

  return (
    <div className="app">
      <header className="app-header">
        <h1>String Theory</h1>
      </header>

      <main className="tab-content">
        {activeTab === 'tuner' && <Tuner />}
        {activeTab === 'scales' && <Scales />}
        {activeTab === 'theory' && <Theory />}
      </main>

      <nav className="bottom-nav">
        <button
          className={`nav-btn${activeTab === 'tuner' ? ' active' : ''}`}
          onClick={() => setActiveTab('tuner')}
        >
          Tuner
        </button>
        <button
          className={`nav-btn${activeTab === 'scales' ? ' active' : ''}`}
          onClick={() => setActiveTab('scales')}
        >
          Scales/Chords
        </button>
        <button
          className={`nav-btn${activeTab === 'theory' ? ' active' : ''}`}
          onClick={() => setActiveTab('theory')}
        >
          Theory
        </button>
      </nav>
    </div>
  )
}
