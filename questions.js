// questions.js
export const QUIZ = {
  rounds: [
    {
      id: "quickfire",
      name: "Quickfire",
      type: "qa",
      questions: [
        { q: "What is the capital of Scotland?", a: "Edinburgh" },
        { q: "How many colours are there on the Union Jack?", a: "Three (red, white, blue)" },
        { q: "Which planet is known as the Red Planet?", a: "Mars" }
      ]
    },
    {
      id: "mcq",
      name: "Multiple Choice",
      type: "mcq",
      questions: [
        {
          q: "Which is not a programming language?",
          options: ["Python", "Java", "Cabbage", "Ruby"],
          correctIndex: 2
        },
        {
          q: "What is the largest ocean on Earth?",
          options: ["Atlantic", "Indian", "Arctic", "Pacific"],
          correctIndex: 3
        },
        {
          q: "Which animal is on the WWF logo?",
          options: ["Tiger", "Panda", "Elephant", "Koala"],
          correctIndex: 1
        }
      ]
    }
  ]
};
