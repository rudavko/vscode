/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionPoint, IExtensionPointUser } from 'vs/workbench/services/extensions/common/extensionsRegistry';
import { ViewsWelcomeExtensionPoint, ViewWelcome, ViewIdentifierMap } from './viewsWelcomeExtensionPoint';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as ViewContainerExtensions, IViewContentDescriptor, IViewsRegistry } from 'vs/workbench/common/views';
import { isProposedApiEnabled } from 'vs/workbench/services/extensions/common/extensions';

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

export class ViewsWelcomeContribution extends Disposable implements IWorkbenchContribution {

	private viewWelcomeContents = new Map<ViewWelcome, IDisposable>();

	constructor(extensionPoint: IExtensionPoint<ViewsWelcomeExtensionPoint>) {
		super();

		extensionPoint.setHandler((_, { added, removed }) => {
			for (const contribution of removed) {
				for (const welcome of contribution.value) {
					const disposable = this.viewWelcomeContents.get(welcome);

					if (disposable) {
						disposable.dispose();
					}
				}
			}

			const welcomesByViewId = new Map<string, Map<ViewWelcome, IViewContentDescriptor>>();

			for (const contribution of added) {
				for (const welcome of contribution.value) {
					const { group, order } = parseGroupAndOrder(welcome, contribution);
					const precondition = ContextKeyExpr.deserialize(welcome.enablement);

					const id = ViewIdentifierMap[welcome.view] ?? welcome.view;
					let viewContentMap = welcomesByViewId.get(id);
					if (!viewContentMap) {
						viewContentMap = new Map();
						welcomesByViewId.set(id, viewContentMap);
					}

					viewContentMap.set(welcome, {
						content: welcome.contents,
						when: ContextKeyExpr.deserialize(welcome.when),
						precondition,
						group,
						order
					});
				}
			}

			for (const [id, viewContentMap] of welcomesByViewId) {
				const disposables = viewsRegistry.registerViewWelcomeContent2(id, viewContentMap);

				for (const [welcome, disposable] of disposables) {
					this.viewWelcomeContents.set(welcome, disposable);
				}
			}
		});
	}
}

function parseGroupAndOrder(welcome: ViewWelcome, contribution: IExtensionPointUser<ViewsWelcomeExtensionPoint>): { group: string | undefined, order: number | undefined } {

	let group: string | undefined;
	let order: number | undefined;
	if (welcome.group) {
		if (!isProposedApiEnabled(contribution.description)) {
			contribution.collector.warn(nls.localize('ViewsWelcomeExtensionPoint.proposedAPI', "The viewsWelcome contribution in '{0}' requires 'enableProposedApi' to be enabled.", contribution.description.identifier.value));
			return { group, order };
		}

		const idx = welcome.group.lastIndexOf('@');
		if (idx > 0) {
			group = welcome.group.substr(0, idx);
			order = Number(welcome.group.substr(idx + 1)) || undefined;
		} else {
			group = welcome.group;
		}
	}
	return { group, order };
}
