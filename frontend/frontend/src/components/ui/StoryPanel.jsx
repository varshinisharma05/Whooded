import React from 'react';

const StoryPanel = ({
  backgroundImageUrl,
  title,
  description,
  onNext, // Optional: function to call when Next button is clicked
  showNextButton = true // Optional: boolean to show/hide Next button
}) => {
  return (
    <div
      className="relative w-full h-screen flex items-center justify-center overflow-hidden"
      style={{
        backgroundImage: `url(${backgroundImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Semi-transparent dark overlay for readability */}
      <div className="absolute inset-0 bg-black opacity-60"></div>

      {/* Content Area */}
      <div className="relative z-10 p-4 max-w-3xl mx-auto text-center text-white">
        {/* Dark blur or gradient behind text to improve readability */}
        <div className="bg-black bg-opacity-50 backdrop-blur-sm p-6 rounded-lg shadow-lg">
          {title && (
            <h1 className="text-3xl md:text-5xl font-bold mb-4">
              {title}
            </h1>
          )}
          {description && (
            <p className="text-lg md:text-xl leading-relaxed">
              {description}
            </p>
          )}
          {showNextButton && onNext && (
            <button
              onClick={onNext}
              className="mt-8 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition duration-300 ease-in-out"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StoryPanel;
