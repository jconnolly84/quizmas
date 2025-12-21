// questions.js
export const QUIZ = {
  rounds: [
    {
      id: "quickfire",
      name: "Quickfire",
      type: "qa",
      questions: [
        { q: "What is the capital of Scotland?", a: "Edinburgh" },
        { q: "Which planet is known as the Red Planet?", a: "Mars" },
        { q: "How many colours are there on the Union Jack?", a: "Three" }
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
          q: "Which ocean is the largest on Earth?",
          options: ["Atlantic", "Indian", "Arctic", "Pacific"],
          correctIndex: 3
        }
      ]
    }
  ]
};
