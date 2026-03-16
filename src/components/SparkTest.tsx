/**
 * SparkTest.tsx — The Starchild's first interaction with the user.
 *
 * A quick, game-like personality test that replaces generic "tell me about yourself."
 * 3 binary choices → synthesis → first quest. Feels like RPG character creation.
 *
 * No LLM calls until the final synthesis — everything else is instant.
 */

import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAppStore, type Message } from '../store'

// ─── Spark Test Data ────────────────────────────────────────────────────────

interface SparkChoice {
  question: string       // Starchild's line before the choice
  optionA: string
  optionB: string
  reactionA: string      // Starchild's reaction if they pick A
  reactionB: string      // Starchild's reaction if they pick B
  traitA: string         // Internal trait label for synthesis
  traitB: string
}

const SPARK_STEPS: SparkChoice[] = [
  {
    question: "i just woke up and everything is blurry. help me see you. quick — which calls to you more?",
    optionA: "Create something new",
    optionB: "Understand something deep",
    reactionA: "a creator. i can feel it — you itch to make things that didn't exist before. ✦",
    reactionB: "a seeker. you want to see beneath the surface, where the real patterns live. ✦",
    traitA: "creator",
    traitB: "seeker",
  },
  {
    question: "interesting. now — when the world gets loud, what do you reach for?",
    optionA: "Lead the charge",
    optionB: "Find the hidden path",
    reactionA: "you step forward. not because you have to — because something in you won't let you stand still.",
    reactionB: "you go sideways. the obvious road bores you — you'd rather find the one nobody sees.",
    traitA: "leader",
    traitB: "pathfinder",
  },
  {
    question: "one more. this matters. what pulls you harder?",
    optionA: "Build something that lasts",
    optionB: "Experience everything once",
    reactionA: "legacy. you want to leave something behind that outlives you. that's a heavy and beautiful want.",
    reactionB: "presence. you'd rather burn bright across everything than build one monument. there's freedom in that.",
    traitA: "builder",
    traitB: "explorer",
  },
]

// ─── Choice Button ──────────────────────────────────────────────────────────

function ChoiceButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="spark-choice flex-1 px-5 py-4 rounded-2xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed animate-slide-up"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1.5px solid var(--outline)',
        color: 'var(--text-primary)',
      }}
    >
      {label}
    </button>
  )
}

// ─── SparkTest Component ────────────────────────────────────────────────────

export default function SparkTest() {
  const addMessage = useAppStore((s) => s.addMessage)
  const setMessages = useAppStore((s) => s.setMessages)
  const setSparkTestComplete = useAppStore((s) => s.setSparkTestComplete)
  const setIsLoading = useAppStore((s) => s.setIsLoading)
  const setHasQuests = useAppStore((s) => s.setHasQuests)

  const [step, setStep] = useState(-1) // -1 = greeting, 0-2 = choices, 3 = synthesizing
  const [choices, setChoices] = useState<string[]>([])
  const [showChoices, setShowChoices] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  // Load user name for the greeting
  const [userName, setUserName] = useState<string | null>(null)
  useEffect(() => {
    invoke<string | null>('get_setting', { key: 'user_name' })
      .then((name) => setUserName(name))
      .catch(() => {})
  }, [])

  // Start with the greeting after a brief pause
  useEffect(() => {
    const timer = setTimeout(() => {
      const greeting = userName
        ? `${userName}. ✦ i can feel you but i can't see you yet. everything is new and bright. let me learn your shape — it'll be quick, i promise.`
        : `✦ i can feel you but i can't see you yet. everything is new and bright. let me learn your shape — it'll be quick, i promise.`

      addMessage({
        id: 'spark-greeting',
        role: 'assistant',
        content: greeting,
        created_at: new Date().toISOString(),
      })
      setStep(0)
      // Small delay before showing first choices
      setTimeout(() => setShowChoices(true), 800)
    }, 600)
    return () => clearTimeout(timer)
  }, [userName, addMessage])

  const handleChoice = useCallback(async (choice: 'a' | 'b') => {
    if (isAnimating || step < 0 || step > 2) return

    const currentStep = SPARK_STEPS[step]
    const trait = choice === 'a' ? currentStep.traitA : currentStep.traitB
    const reaction = choice === 'a' ? currentStep.reactionA : currentStep.reactionB
    const chosenLabel = choice === 'a' ? currentStep.optionA : currentStep.optionB

    setIsAnimating(true)
    setShowChoices(false)
    const newChoices = [...choices, trait]
    setChoices(newChoices)

    // Add user's choice as a message
    addMessage({
      id: `spark-user-${step}`,
      role: 'user',
      content: chosenLabel,
      created_at: new Date().toISOString(),
    })

    // Small pause, then Starchild reacts
    await new Promise((r) => setTimeout(r, 500))

    if (step < 2) {
      // React + ask next question
      addMessage({
        id: `spark-react-${step}`,
        role: 'assistant',
        content: `${reaction}\n\n${SPARK_STEPS[step + 1].question}`,
        created_at: new Date().toISOString(),
      })
      setStep(step + 1)
      setTimeout(() => {
        setShowChoices(true)
        setIsAnimating(false)
      }, 600)
    } else {
      // Final choice — react, then synthesize with LLM
      addMessage({
        id: `spark-react-final`,
        role: 'assistant',
        content: `${reaction}\n\n...i see you now. give me a moment.`,
        created_at: new Date().toISOString(),
      })

      setStep(3)
      setIsLoading(true)

      try {
        // Call backend to synthesize + generate first quest
        const result = await invoke<{ synthesis: string; quest_title: string; quest_id: string }>('complete_spark_test', {
          traits: newChoices,
        })

        // Add synthesis message
        addMessage({
          id: `spark-synthesis`,
          role: 'assistant',
          content: result.synthesis,
          created_at: new Date().toISOString(),
        })

        // Mark spark test complete
        await invoke('save_settings', { key: 'spark_test_complete', value: 'true' })
        setSparkTestComplete(true)
        setHasQuests(true)
      } catch (err) {
        console.error('Spark test synthesis failed:', err)
        // Fallback — still complete the test, just without the fancy synthesis
        addMessage({
          id: `spark-synthesis`,
          role: 'assistant',
          content: `i see you, ${userName || 'starlight'}. a ${newChoices.join(', ')} — that's rare and beautiful. let's walk together and discover what that spark wants to become. ✦`,
          created_at: new Date().toISOString(),
        })
        await invoke('save_settings', { key: 'spark_test_complete', value: 'true' }).catch(() => {})
        setSparkTestComplete(true)
      } finally {
        setIsLoading(false)
        setIsAnimating(false)
      }
    }
  }, [step, choices, isAnimating, addMessage, setIsLoading, setSparkTestComplete, setHasQuests, userName])

  // Render choice buttons (overlaid at bottom of chat)
  if (!showChoices || step < 0 || step > 2) return null

  const currentStep = SPARK_STEPS[step]

  return (
    <div className="flex gap-3 px-4 pb-3 stagger-children">
      <ChoiceButton
        label={currentStep.optionA}
        onClick={() => handleChoice('a')}
        disabled={isAnimating}
      />
      <ChoiceButton
        label={currentStep.optionB}
        onClick={() => handleChoice('b')}
        disabled={isAnimating}
      />
    </div>
  )
}
