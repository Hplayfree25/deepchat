# Contributing to DeepChat

Welcome! Thank you for taking the time to contribute to DeepChat. This project is a local-first AI chat workspace built to be fast, private, and customizable. We are excited to have you join our development journey.

We want contributing to be as simple, enjoyable, and rewarding as possible. To make sure everyone feels welcome and to keep our codebase pleasant to work with, we have kept our guidelines friendly and straightforward.

---

## Welcome to the Team

Whether you are fixing a small typo, improving the mobile styling, adding a new AI model provider, or suggesting a major new feature, your help is highly appreciated. DeepChat is in active development, and we value every pull request.

---

## Getting Started is Easy

We use modern but simple tools to keep the development setup painless:

1. **Package Manager:** We use pnpm to manage our dependencies because it is fast and efficient. To get started, simply run:
```bash
pnpm install
```
2. **Running the App:** If you are on Windows, you can launch the app directly by double-clicking:
```text
deepchat.bat
```
This bat file automatically handles everything from folder creation to local port checking, compilation, and starting your browser.

---

## Simple Code Guidelines

To keep the project clean and understandable for everyone, we suggest a few easy practices:

- **Write Explanatory Comments:** We welcome comments! If you are writing complex logic, adding custom hooks, or setting up a database operation, feel free to add clear comments explaining how your code works. This helps other contributors understand your thought process.
- **Keep Code Readable:** Try to use clear, punchy names for your variables and functions. Readable code makes it easier for everyone to collaborate.
- **Mobile-First Layouts:** Since many users enjoy using the chat on their mobile phones and tablets, please try to make your UI changes look good on smaller screens first, then scale them up for desktop.
- **Test Your Changes:** Before submitting a pull request, run a quick build and lint check to make sure everything compiles smoothly:
```bash
pnpm build
pnpm lint
```

---

## How to Submit Your Contribution

1. Fork the repository and create your branch from main.
2. Make your changes and test them locally using deepchat.bat or pnpm dev.
3. Commit your changes with a clear and simple description of what you did.
4. Push your branch and open a Pull Request. We will review it as soon as possible and work with you to merge it.

Thank you again for making DeepChat better for everyone. Happy coding!
