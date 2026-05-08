# **AI Challenge - Decade**

## **Context**

At [Decade](https://decade.com), our investments team writes detailed conviction documents that guide how we analyze markets, evaluate instruments, and advise clients. These documents are long, nuanced, and opinionated — they represent our institutional knowledge on dozens of investment topics.

One of the core challenges for our AI team is ensuring that our AI assistant follows these convictions precisely. As the number of documents grows, maintaining strict adherence becomes increasingly difficult. This is the problem we'd like you to explore.

## **The Challenge**

Build a conversational AI assistant that answers investment questions **strictly grounded on the conviction documents we provide you in this package**.

This is the most important requirement: when a user asks about a topic covered by the convictions, the assistant's answer **must** be based entirely on what the documents say; not on the model's general knowledge, not on common sense, not on what the model "thinks" is correct. If the convictions say it, the assistant says it. Faithfulness to the conviction documents is the core challenge you are tackling here.

If the convictions don't cover a topic, the assistant can either decline to answer or use its own knowledge, but it should make clear it's doing so. 

## **Requirements**

### Core Requirements

Your solution must satisfy these requirements:

1. **Strict grounding on conviction documents**: Answers to in-scope questions must be 100% based on the provided convictions.

2. **Provider and model portability**: It should be straightforward to switch the underlying LLM provider and model (e.g., switch from OpenAI to Anthropic, or from one model to another within the same provider).

3. **Language support**: The assistant should respond in the same language the user writes in.

### Deliverables

- **An API** that takes a user message and returns the assistant's response. This is the core deliverable.
- **An easy way for us to test it** with ~10 questions of our choosing. Don't spend too much time or effort on deployment — if it ever becomes a bottleneck, reach out to us and we'll figure it out together. It is not a priority nor something we will deeply evaluate, but we jsut need a way to test it.
- **A README.md** explaining your approach, architecture, and key design decisions. It should also include a section on what you would change to make this production-ready.
- **A basic UI** is welcome but not required.

### Bonus

- **File handling**: Bonus points if the assistant can correctly handle user-uploaded PDF and Excel files as part of the conversation. When designing this, keep the provider portability requirement in mind. If you don't implement this, you are welcome to include a section in your README explaining what you think the best approach would be for a scalable, vendor-agnostic solution.

## **Important Notes**

- **How we evaluate**: We care about the quality of the assistant's answers, your code quality, and your architectural decisions.
- **Methodology**: You have complete freedom over your tech stack, architecture, and approach. Use whatever tools, frameworks, and strategies you believe will produce the best results. AI tooling evolves fast; we encourage you to leverage the best technologies available at the moment, and even think about how your solution would adapt and benefit from LLMs getting 10x better in the next 12 months.
- **Pragmatism**: You're welcome to use managed services or out-of-the-box tools even if they wouldn't scale in production (due to cost, rate limits, etc.), as long as you explicitly flag these limitations and include a concrete proposal for how you'd make them scalable.
- **Use of AI tools**: You're welcome to use AI coding assistants. We care about the final deliverable: clean, well-structured code that you can confidently explain and defend. You should understand every part of your solution, since we will discuss implementation details and design decisions.
- **Questions?** If anything is unclear, reach out. We'd rather you ask than make wrong assumptions.
