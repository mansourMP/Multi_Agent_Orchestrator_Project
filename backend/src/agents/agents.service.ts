import { Injectable } from '@nestjs/common';
import { SquadGraph } from './squad.graph';
import { SquadConfig } from './agent.types';
import { HumanMessage } from '@langchain/core/messages';

@Injectable()
export class AgentsService {
    constructor(private squadGraph: SquadGraph) { }

    async startSquadSession(config: SquadConfig) {
        const graph = this.squadGraph.createGraph();

        // Initialize state
        const initialState = {
            messages: [new HumanMessage(config.userGoal)],
            squadConfig: config,
            next: 'CEO'
        };

        // In a real app, we would return a stream or a thread ID.
        // For MVP, we'll just start it and return the graph runnable or initial stream.
        // We probably want to stream events back to the controller.

        return graph.stream(initialState, {
            streamMode: 'values'
        });
    }
}
