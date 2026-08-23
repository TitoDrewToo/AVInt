import { OperationsShell } from "@/components/systems/operations-shell"
import { SystemsInternalGate } from "@/components/systems/systems-access"
import { InquiriesConsole } from "@/app/systems/inquiries-console"

export default function SystemsInquiriesPage() {
  return <SystemsInternalGate><OperationsShell active="inquiries"><InquiriesConsole /></OperationsShell></SystemsInternalGate>
}
