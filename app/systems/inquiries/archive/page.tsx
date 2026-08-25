import { OperationsShell } from "@/components/systems/operations-shell"
import { SystemsInternalGate } from "@/components/systems/systems-access"
import { InquiriesConsole } from "@/app/systems/inquiries-console"

export default function SystemsInquiriesArchivePage() {
  return <SystemsInternalGate><OperationsShell active="inquiries"><InquiriesConsole view="archive" /></OperationsShell></SystemsInternalGate>
}
