export type StudyGameSet = {
  title: string;
  key_terms: { term: string; definition: string }[];
  questions: {
    question: string;
    options: string[];
    correct_index: number;
    explanation: string;
  }[];
};

/** Built-in anatomy pack so game play does not depend on AI generation or quota. */
export const fixedStudyGames: StudyGameSet = {
  title: 'Anatomy essentials',
  key_terms: [
    { term: 'Neuron', definition: 'A nerve cell that sends and receives signals.' },
    { term: 'Alveoli', definition: 'Tiny air sacs in the lungs where gas exchange happens.' },
    { term: 'Artery', definition: 'A blood vessel that carries blood away from the heart.' },
    { term: 'Vein', definition: 'A blood vessel that carries blood toward the heart.' },
    { term: 'Femur', definition: 'The thigh bone and the longest bone in the body.' },
    { term: 'Diaphragm', definition: 'A muscle that helps draw air into the lungs.' },
    { term: 'Cerebellum', definition: 'A brain region that helps coordinate balance and movement.' },
    { term: 'Tendon', definition: 'Strong connective tissue that attaches muscle to bone.' },
  ],
  questions: [
    { question: 'Where does oxygen move into the blood in the lungs?', options: ['Bronchi', 'Alveoli', 'Trachea', 'Diaphragm'], correct_index: 1, explanation: 'The thin walls of the alveoli allow oxygen and carbon dioxide to move between air and blood.' },
    { question: 'Which vessel carries blood away from the heart?', options: ['Vein', 'Capillary', 'Artery', 'Tendon'], correct_index: 2, explanation: 'Arteries carry blood away from the heart; veins return blood to it.' },
    { question: 'What does the cerebellum mainly help coordinate?', options: ['Balance and movement', 'Digestion', 'Blood filtration', 'Hormone storage'], correct_index: 0, explanation: 'The cerebellum helps coordinate movement and balance.' },
    { question: 'What connects a muscle to a bone?', options: ['Ligament', 'Neuron', 'Tendon', 'Cartilage'], correct_index: 2, explanation: 'Tendons attach muscles to bones. Ligaments connect bones to other bones.' },
    { question: 'Which bone is found in the thigh?', options: ['Ulna', 'Femur', 'Sternum', 'Tibia'], correct_index: 1, explanation: 'The femur is the thigh bone and the body’s longest bone.' },
    { question: 'What muscle contracts to help you breathe in?', options: ['Biceps', 'Cerebellum', 'Diaphragm', 'Tendon'], correct_index: 2, explanation: 'When the diaphragm contracts, it moves down and helps expand the chest cavity.' },
    { question: 'What is the basic job of a neuron?', options: ['Store minerals', 'Carry nerve signals', 'Make red blood cells', 'Digest proteins'], correct_index: 1, explanation: 'Neurons are specialized cells that communicate using electrical and chemical signals.' },
    { question: 'Which vessel usually returns blood toward the heart?', options: ['Artery', 'Vein', 'Alveolus', 'Tendon'], correct_index: 1, explanation: 'Veins return blood toward the heart.' },
  ],
};
