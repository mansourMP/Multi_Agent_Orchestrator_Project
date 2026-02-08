import os
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv

load_dotenv()

# Ensure API key is provided (required for production safety)
_ = os.environ["OPENAI_API_KEY"]

# Initialize LLM
llm = ChatOpenAI(model="gpt-4o")

# Define agents aligned with the orchestration vision
ceo = Agent(
    role='CEO',
    goal='Synthesize escalations, approve expensive moves, keep the crew honest.',
    backstory='Seasoned executive who delegates, trusts but verifies, and human-in-the-loop gating.',
    llm=llm
)

marketing_manager = Agent(
    role='Marketing',
    goal='Write positioning, copy, and go-to-market strategy.',
    backstory='Story-first content creator who understands compliance and tone.',
    llm=llm
)

coder = Agent(
    role='Coder',
    goal='Implement the workflow logic.',
    backstory='Systems engineer focused on reliability.',
    llm=llm
)

designer = Agent(
    role='Designer',
    goal='Produce UI/UX concepts for the mission.',
    backstory='Creative mind who keeps aesthetics premium.',
    llm=llm
)

# Define tasks with expected_output
strategy_task = Task(
    description='Outline the marketing narrative and KPIs.',
    expected_output='Executive brief with 3 KPIs and targeted tone.',
    agent=marketing_manager
)

implementation_task = Task(
    description='Translate strategy into workflow steps.',
    expected_output='Code snippets, task breakdown, and validation checklist.',
    agent=coder
)

design_task = Task(
    description='Mock the user experience and branding.',
    expected_output='High-level layout description plus copy samples.',
    agent=designer
)

final_check_task = Task(
    description='Review the plan and authorize deployment.',
    expected_output='Final approval summary and go/no-go recommendation.',
    agent=ceo,
    human_input=True
)

conductor_crew = Crew(
    agents=[ceo, marketing_manager, coder, designer],
    tasks=[strategy_task, implementation_task, design_task, final_check_task],
    process=Process.hierarchical,
    verbose=False,
    manager_llm=llm,
    max_iter=15
)
