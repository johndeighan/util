Listr2 docs
===========

Task Objects:
{
	title: string
	options: hash   # e.g. bottomBar: true
	task: TVoidFunc
	onRollback: TVoidFunc
	}

Example Task:

	task: (ctx, task): void =>
		task.output = 'Compiling...'
		hResult := await doCompileFile.handleFile path, {
			force: true
			postproc: false
			}
		if (hResult.notNeeded)
			ctx.nNotNeeded += 1
			task.title = f"#{task.title}:-14 #{'not needed'}:{yellow}"
		else
			ctx.nCompiled += 1
			task.title = f"#{task.title}:-14 #{'compiled'}:{green}"
		return

- tasks may contain awaited function calls
- strings assigned to task.output appear below the task title
	each assignment to output overwrites the previous one
		- only when using the default renderer
	setting task.output to null clears the output
- you can use anything as the context, but usually a hash
- you can re-assign the task title
- indicate errors by throwing Error object (e.g. with croak())
- when an error occurs, the onRollback function is called


Options you can pass to runTasks():

{
	concurrent: true        # --- or false, 1, 2, 3, etc.
	exitOnError: false      # continue after errors
	collectErrors: true     # put into tasks.errors
	persistentOutput: true  # Keep output visible after task finishes
	renderer: 'verbose'
	rendererOptions: {
		showSubtasks: false
		collapseSubtasks: false
		clearOutput: false
		formatOutput: 'truncate' | 'wrap'
		showErrorMessage: true
		showTimer: true
		collapse: true       # --- collapse subtasks
		outputBar: true
		bottomBar: true
		}
	}

outputBar can be:
	true - only keep the last line
	Infinify - keep all the lines
	<number> - keep the given number of lines
	false - no output is rendered

bottomBar has the same possible values and is rendered after
	all the tasks

use task.stdout to send info to the bottom bar

if a task has no title, output is rendered in the bottom bar
