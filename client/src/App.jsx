import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import RoomPage from './pages/RoomPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:code" element={<RoomPage />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
