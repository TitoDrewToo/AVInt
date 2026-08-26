"use client"

import { motion } from "framer-motion"

// Re-mounts on every navigation in App Router — gives consistent page fade-in
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ y: 10 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {children}
    </motion.div>
  )
}
