import React, { useState, useEffect } from 'react';
import StoryPanel from "./ui/StoryPanel";
import useSound from '../hooks/useSound';

import scene1 from '../assets/story/scene1_peaceful_village.jpg';
import scene2 from '../assets/story/scene2_community.jpg';
import scene3 from '../assets/story/scene3_dark_turn.jpg';
import scene4 from '../assets/story/scene4_suspicion.jpg';
import scene5 from '../assets/story/scene5_gathering.jpg';

const StoryIntro = ({ onComplete }) => {
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);

  // Sound hooks for the story intro
  const { play: playMusic, stop: stopMusic } = useSound("/audio/background/lobby.mp3", { loop: true, volume: 0.3 });
  const { play: playClick } = useSound("/audio/ui/click-1.mp3");

  // Start/stop music when component mounts/unmounts
  useEffect(() => {
    playMusic();
    return () => {
      stopMusic();
    };
  }, [playMusic, stopMusic]);

  const storyPanels = [
    { backgroundImageUrl: scene1, title: "A Peaceful Village", description: "In a quiet corner of the world, a village thrived in harmony, its people living simple, joyful lives." },
    { backgroundImageUrl: scene2, title: "A Flourishing Community", description: "Days were filled with laughter and shared meals, a testament to their close-knit bonds and prosperity." },
    { backgroundImageUrl: scene3, title: "The Shadow Falls", description: "But as night fell, an ancient evil stirred, casting long, ominous shadows over their peaceful existence." },
    { backgroundImageUrl: scene4, title: "Whispers of Betrayal", description: "Whispers of betrayal and fear spread like wildfire, as suspicion began to poison the hearts of the villagers." },
    { backgroundImageUrl: scene5, title: "The Gathering", description: "With their lives at stake, the villagers must now unite, for only together can they unmask the darkness that lurks among them." },
  ];

  const isLastPanel = currentPanelIndex === storyPanels.length - 1;

  const handleNextPanel = () => {
    playClick(); // Play click sound on next
    if (!isLastPanel) {
      setCurrentPanelIndex(prevIndex => prevIndex + 1);
    } else {
      if (onComplete) {
        stopMusic(); // Stop music when intro is complete
        onComplete();
      }
    }
  };

  const handleSkipIntro = () => {
    if (onComplete) {
      stopMusic(); // Stop music if intro is skipped
      onComplete();
    }
  };
  

  const currentPanel = storyPanels[currentPanelIndex];

  return (
    <div className="relative w-full h-screen">
      <StoryPanel
        backgroundImageUrl={currentPanel.backgroundImageUrl}
        title={currentPanel.title}
        description={currentPanel.description}
        onNext={handleNextPanel}
        showNextButton={!isLastPanel}
      />
      <button
        onClick={handleSkipIntro}
        className="absolute top-4 right-4 z-20 px-4 py-2 bg-gray-800 bg-opacity-70 text-white rounded-lg shadow-md hover:bg-opacity-90 transition duration-300"
      >
        Skip Intro
      </button>
    </div>
  );
};

export default StoryIntro;
