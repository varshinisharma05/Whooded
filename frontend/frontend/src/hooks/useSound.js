import { useMemo, useState, useEffect } from 'react';
import { Howl } from 'howler';

const useSound = (src, options = {}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  // Create Howl only once per src
  const sound = useMemo(() => {
    if (!src) {
      console.warn("useSound hook was called with an empty audio source.");
      return null;
    }

    return new Howl({
      src: [src],
      preload: true,
      html5: options.html5 || false, // Use HTML5 for streaming large files
      volume: options.volume ?? 1.0,
      loop: options.loop ?? false,
      onloaderror: (id, error) => {
        console.error(`Howler failed to load sound from: ${src}. Error: ${error}`);
      },
    });
  }, [src, options.html5, options.volume, options.loop]);

  useEffect(() => {
    if (!sound) return;

    const onPlay = () => setIsPlaying(true);
    const onStop = () => setIsPlaying(false);
    const onPause = () => setIsPlaying(false);
    const onEnd = () => setIsPlaying(false);

    sound.on('play', onPlay);
    sound.on('stop', onStop);
    sound.on('pause', onPause);
    sound.on('end', onEnd);

    return () => {
      sound.off('play', onPlay);
      sound.off('stop', onStop);
      sound.off('pause', onPause);
      sound.off('end', onEnd);
      // Unload the sound to free up memory when the component unmounts
      sound.unload();
    };
  }, [sound]);

  const play = () => sound && sound.play();
  const stop = () => sound && sound.stop();
  const pause = () => sound && sound.pause();
  const setVolume = (volume) => sound && sound.volume(volume);

  return { play, stop, pause, setVolume, isPlaying, sound };
};

export default useSound;
