import Dashboard from "./Dashboard";
import LoginGate from "./LoginGate";
import MotionProvider from "./MotionProvider";

export default function Home() {
  return (
    <MotionProvider>
      <LoginGate>
        <Dashboard />
      </LoginGate>
    </MotionProvider>
  );
}
