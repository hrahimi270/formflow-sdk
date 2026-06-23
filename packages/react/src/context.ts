'use client';

/**
 * The React context that carries the framework-agnostic {@link FormFlowStore}
 * down the tree. Created here (not in the provider file) so both the provider
 * and the consuming hooks can import it without a circular dependency, and so it
 * stays a plain module with no JSX.
 */

import { createContext } from 'react';
import type { FormFlowStore } from '@formflowjs/core';

/**
 * Context value: the live store instance. `null` when a hook/component is used
 * outside a {@link FormFlowProvider} (consumers throw a helpful error).
 */
export const FormFlowContext = createContext<FormFlowStore | null>(null);

FormFlowContext.displayName = 'FormFlowContext';
